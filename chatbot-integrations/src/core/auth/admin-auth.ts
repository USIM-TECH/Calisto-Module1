import type { NextFunction, Request, Response } from 'express'

export function createAdminAuthMiddleware(adminApiToken: string | undefined) {
  return function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
    if (!adminApiToken) {
      res.status(503).json({ error: 'ADMIN_API_TOKEN is not configured on the server' })
      return
    }

    const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
    if (header !== `Bearer ${adminApiToken}`) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    next()
  }
}
