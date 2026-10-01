import type { PrismaClient } from '@prisma/client'
import type { Express, NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import type { WebsiteRateLimiter } from '../../app/website-rate-limiter.js'
import type { Logger } from '../utils/index.js'
import {
  ADMIN_SESSION_COOKIE,
  clearSessionCookie,
  isSameOriginRequest,
  readCookie,
  setSessionCookie,
} from './admin-auth.js'
import { hashPassword, PASSWORD_MAX_LENGTH, validatePasswordStrength, verifyAgainstDummy, verifyPassword } from './password.js'
import type { AdminSessionService, AuthenticatedSession } from './session-service.js'

export interface AuthRouteDependencies {
  prisma?: PrismaClient
  sessions?: AdminSessionService
  loginRateLimiter: WebsiteRateLimiter
  cookieSecure: boolean
  trustProxy: boolean
  logger: Logger
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string(),
})

const INVALID_CREDENTIALS = 'Invalid email or password'

export function registerAuthRoutes(app: Express, deps: AuthRouteDependencies): void {
  const { prisma, sessions, loginRateLimiter, cookieSecure, trustProxy, logger } = deps

  app.use('/auth', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!prisma || !sessions) {
      res.status(503).json({ error: 'Admin login requires STORAGE_BACKEND=mysql' })
      return
    }
    if (!isSameOriginRequest(req, trustProxy)) {
      res.status(403).json({ error: 'Cross-origin request rejected' })
      return
    }
    next()
  })

  if (!prisma || !sessions) {
    return
  }

  async function currentSession(req: Request): Promise<{ token: string; session: AuthenticatedSession } | null> {
    const token = readCookie(req, ADMIN_SESSION_COOKIE)
    if (!token) return null
    const session = await sessions!.validate(token)
    return session ? { token, session } : null
  }

  app.post('/auth/login', async (req, res) => {
    try {
      if (!(await loginRateLimiter.allow(req.ip ?? 'unknown'))) {
        res.status(429).json({ error: 'Too many login attempts. Please wait a minute and try again.' })
        return
      }

      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Email and password are required' })
        return
      }
      const { email, password } = parsed.data

      const user = await prisma.adminUser.findUnique({ where: { email } })
      const valid = user
        ? await verifyPassword(password, user.passwordHash)
        : await verifyAgainstDummy(password)

      if (!user || !valid || !user.isActive) {
        logger.warn(`Admin login failed for ${email} from ${req.ip}`)
        res.status(401).json({ error: INVALID_CREDENTIALS })
        return
      }

      const token = await sessions.create(user.id, { ip: req.ip, userAgent: req.get('user-agent') })
      await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      setSessionCookie(res, token, { secure: cookieSecure, maxAgeMs: sessions.options.absoluteTimeoutMs })

      logger.info(`Admin login succeeded for ${email} from ${req.ip}`)
      res.json({ user: { id: user.id, email: user.email, name: user.name } })
    } catch (error: any) {
      logger.error(`Admin login error: ${error.message}`)
      res.status(500).json({ error: 'Login failed' })
    }
  })

  app.post('/auth/logout', async (req, res) => {
    try {
      const token = readCookie(req, ADMIN_SESSION_COOKIE)
      if (token) {
        await sessions.revoke(token)
      }
    } catch (error: any) {
      logger.error(`Admin logout error: ${error.message}`)
    }
    clearSessionCookie(res, { secure: cookieSecure })
    res.status(204).end()
  })

  app.get('/auth/me', async (req, res) => {
    try {
      const current = await currentSession(req)
      if (!current) {
        clearSessionCookie(res, { secure: cookieSecure })
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      res.json({ user: current.session.user })
    } catch (error: any) {
      logger.error(`Admin session check error: ${error.message}`)
      res.status(500).json({ error: 'Session check failed' })
    }
  })

  app.post('/auth/change-password', async (req, res) => {
    try {
      const current = await currentSession(req)
      if (!current) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const parsed = changePasswordSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Current and new password are required' })
        return
      }
      const { currentPassword, newPassword } = parsed.data

      const strengthError = validatePasswordStrength(newPassword)
      if (strengthError) {
        res.status(400).json({ error: strengthError })
        return
      }

      const user = await prisma.adminUser.findUnique({ where: { id: current.session.user.id } })
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
        res.status(400).json({ error: 'Current password is incorrect' })
        return
      }

      await prisma.adminUser.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
      })
      // Sign out every other device; keep the session that made the change.
      await sessions.revokeAllForUser(user.id, current.session.sessionId)

      logger.info(`Admin password changed for ${user.email}`)
      res.status(204).end()
    } catch (error: any) {
      logger.error(`Admin change-password error: ${error.message}`)
      res.status(500).json({ error: 'Password change failed' })
    }
  })
}
