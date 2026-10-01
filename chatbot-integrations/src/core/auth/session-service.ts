import * as crypto from 'crypto'
import type { PrismaClient } from '@prisma/client'

export interface AdminUserSummary {
  id: string
  email: string
  name: string | null
}

export interface AuthenticatedSession {
  sessionId: string
  user: AdminUserSummary
}

export interface AdminSessionOptions {
  idleTimeoutMs: number
  absoluteTimeoutMs: number
}

// Avoid a DB write on every request: only extend the idle timer once a minute.
const TOUCH_INTERVAL_MS = 60_000

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function toSummary(user: { id: string; email: string; name: string | null }): AdminUserSummary {
  return { id: user.id, email: user.email, name: user.name }
}

export class AdminSessionService {
  constructor(
    private readonly prisma: PrismaClient,
    readonly options: AdminSessionOptions,
  ) {}

  /** Creates a session and returns the raw token to put in the cookie. */
  async create(userId: string, meta: { ip?: string; userAgent?: string }): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url')
    const now = Date.now()
    const absoluteExpiresAt = new Date(now + this.options.absoluteTimeoutMs)

    await this.prisma.adminSession.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Math.min(now + this.options.idleTimeoutMs, absoluteExpiresAt.getTime())),
        absoluteExpiresAt,
        ip: meta.ip?.slice(0, 191),
        userAgent: meta.userAgent?.slice(0, 512),
      },
    })

    // Opportunistic cleanup so expired rows don't pile up.
    await this.prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date(now) } } })

    return token
  }

  /** Returns the session if the token is valid, extending its idle timeout. */
  async validate(token: string): Promise<AuthenticatedSession | null> {
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })
    if (!session) {
      return null
    }

    const now = Date.now()
    if (
      session.expiresAt.getTime() <= now ||
      session.absoluteExpiresAt.getTime() <= now ||
      !session.user.isActive
    ) {
      await this.prisma.adminSession.deleteMany({ where: { id: session.id } })
      return null
    }

    if (now - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(now),
          expiresAt: new Date(Math.min(now + this.options.idleTimeoutMs, session.absoluteExpiresAt.getTime())),
        },
      })
    }

    return { sessionId: session.id, user: toSummary(session.user) }
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } })
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.adminSession.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    })
  }
}
