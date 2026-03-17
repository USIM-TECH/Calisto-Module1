export interface WebsiteRateLimiter {
  allow(key: string): boolean
}

export function createWebsiteRateLimiter(limit: number, windowMs: number): WebsiteRateLimiter {
  const buckets = new Map<string, number[]>()

  return {
    allow(key: string): boolean {
      const now = Date.now()
      const current = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp <= windowMs)
      if (current.length >= limit) {
        buckets.set(key, current)
        return false
      }

      current.push(now)
      buckets.set(key, current)
      return true
    },
  }
}
