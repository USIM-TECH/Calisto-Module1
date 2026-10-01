import * as crypto from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import type { AdminSessionService, AuthenticatedSession } from './session-service.js'

export const ADMIN_SESSION_COOKIE = 'calisto_admin_session'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface AdminAuthOptions {
  /** Static bearer token for services (Rasa action server, scripts). */
  serviceToken?: string
  /** Cookie-based sessions for dashboard users; undefined when MySQL is unavailable. */
  sessions?: AdminSessionService
  cookieSecure: boolean
  /** When the app sits behind a proxy, also accept X-Forwarded-Host in the origin check. */
  trustProxy: boolean
}

function safeEqual(a: string, b: string): boolean {
  const left = crypto.createHash('sha256').update(a).digest()
  const right = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(left, right)
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim()
      try {
        return decodeURIComponent(value) || undefined
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

export function setSessionCookie(res: Response, token: string, options: { secure: boolean; maxAgeMs: number }): void {
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'strict',
    path: '/',
    maxAge: options.maxAgeMs,
  })
}

export function clearSessionCookie(res: Response, options: { secure: boolean }): void {
  res.clearCookie(ADMIN_SESSION_COOKIE, {
    httpOnly: true,
    secure: options.secure,
    sameSite: 'strict',
    path: '/',
  })
}

/**
 * CSRF defence for cookie-authenticated writes: the browser's Origin header must
 * match the host serving the API. Requests without Origin (non-browser clients)
 * are allowed; they cannot carry the SameSite=Strict cookie cross-site anyway.
 */
export function isSameOriginRequest(req: Request, trustProxy: boolean): boolean {
  if (SAFE_METHODS.has(req.method)) return true

  const origin = req.get('origin')
  if (!origin) return true

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }

  const hosts = [req.get('host')]
  if (trustProxy) {
    hosts.push(...(req.get('x-forwarded-host')?.split(',').map((host) => host.trim()) ?? []))
  }
  return hosts.some((host) => host && host === originHost)
}

export function getAdminSession(res: Response): AuthenticatedSession | undefined {
  return res.locals.adminSession as AuthenticatedSession | undefined
}

export function createAdminAuthMiddleware(options: AdminAuthOptions) {
  const { serviceToken, sessions, trustProxy } = options

  return async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.method === 'OPTIONS') {
      next()
      return
    }

    if (!serviceToken && !sessions) {
      res.status(503).json({ error: 'Admin authentication is not configured on the server' })
      return
    }

    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
    if (header.startsWith('Bearer ')) {
      if (serviceToken && safeEqual(header.slice('Bearer '.length), serviceToken)) {
        next()
        return
      }
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const token = readCookie(req, ADMIN_SESSION_COOKIE)
    if (!sessions || !token) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const session = await sessions.validate(token)
      if (!session) {
        clearSessionCookie(res, { secure: options.cookieSecure })
        res.status(401).json({ error: 'Session expired' })
        return
      }
      if (!isSameOriginRequest(req, trustProxy)) {
        res.status(403).json({ error: 'Cross-origin request rejected' })
        return
      }
      res.locals.adminSession = session
      next()
    } catch (error) {
      next(error)
    }
  }
}
