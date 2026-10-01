import axios from 'axios'

/**
 * The public HTTPS base URL (e.g. a Cloudflare tunnel) that channels use to reach
 * this backend: webhook callbacks and absolute product-image URLs.
 *
 * Starts from PUBLIC_BASE_URL and can be changed at runtime (Channels →
 * "Reconnect all") when a quick tunnel restarts with a new hostname, without
 * editing .env or restarting the backend.
 */
export class PublicBaseUrl {
  private value?: string

  constructor(initial?: string) {
    this.value = normalise(initial)
  }

  get(): string | undefined {
    return this.value
  }

  set(url: string): void {
    this.value = normalise(url)
  }
}

function normalise(url?: string): string | undefined {
  const trimmed = url?.trim().replace(/\/+$/, '')
  return trimmed || undefined
}

// cloudflared quick tunnels expose their hostname on a local metrics server,
// on the first free port from 20241 upwards (same lookup as scripts/register-all-webhooks.sh).
const DEFAULT_METRICS_PORTS = Array.from({ length: 10 }, (_, index) => 20241 + index)

/** Returns the live quick-tunnel URL, or undefined when no cloudflared is running locally. */
export async function detectTunnelUrl(preferredPort?: number): Promise<string | undefined> {
  const ports = preferredPort ? [preferredPort, ...DEFAULT_METRICS_PORTS] : DEFAULT_METRICS_PORTS
  for (const port of ports) {
    try {
      const response = await axios.get<{ hostname?: string }>(`http://127.0.0.1:${port}/quicktunnel`, {
        timeout: 1_500,
      })
      const hostname = response.data?.hostname?.trim()
      if (hostname) {
        return `https://${hostname}`
      }
    } catch {
      // Nothing listening on this port; try the next one.
    }
  }
  return undefined
}
