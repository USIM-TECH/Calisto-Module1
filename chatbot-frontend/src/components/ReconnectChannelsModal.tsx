import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Info, Loader2, RefreshCw } from 'lucide-react'
import { getPublicUrlStatus, registerAllChannelWebhooks } from '../api/client'
import Button from './Button'
import Modal from './Modal'
import { useSnackbar } from './Snackbar'
import type { ManagedChannel, RegisterAllWebhooksResult, WebhookRegistrationResult } from '../types'

// Replaces scripts/register-all-webhooks.sh: points every enabled channel at the
// current public URL (e.g. a new Cloudflare tunnel) in one go.

interface ReconnectChannelsModalProps {
  open: boolean
  onClose: () => void
  /** Called after a run so the page can reload account statuses. */
  onFinished: () => void
}

type Phase = 'loading' | 'form' | 'running' | 'done'

const META_APPS_DASHBOARD = 'https://developers.facebook.com/apps/'

function channelName(channel: ManagedChannel): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1)
}

export default function ReconnectChannelsModal({ open, onClose, onFinished }: ReconnectChannelsModalProps) {
  const snackbar = useSnackbar()
  const [phase, setPhase] = useState<Phase>('loading')
  const [url, setUrl] = useState('')
  const [urlSource, setUrlSource] = useState<'tunnel' | 'current' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RegisterAllWebhooksResult | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPhase('loading')
    setError(null)
    setResult(null)
    getPublicUrlStatus()
      .then((status) => {
        if (cancelled) return
        setUrl(status.detected ?? status.current ?? '')
        setUrlSource(status.detected ? 'tunnel' : status.current ? 'current' : null)
        setPhase('form')
      })
      .catch(() => {
        if (cancelled) return
        setUrl('')
        setUrlSource(null)
        setPhase('form')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  async function handleReconnect() {
    setPhase('running')
    setError(null)
    try {
      const response = await registerAllChannelWebhooks(url.trim() || undefined)
      setResult(response)
      setPhase('done')
      onFinished()

      const automatic = response.results.filter((item) => item.status !== 'manual')
      const connected = automatic.filter((item) => item.status === 'active').length
      if (automatic.length === 0) {
        snackbar.info('No channels could be reconnected automatically.')
      } else if (connected === automatic.length) {
        snackbar.success(`${connected} of ${automatic.length} channels reconnected.`)
      } else {
        snackbar.error(`${connected} of ${automatic.length} channels reconnected. Check the errors below.`)
      }
    } catch (err) {
      // Nothing was changed (bad or unreachable URL); let the user fix it and retry.
      setError(err instanceof Error ? err.message : 'Reconnect failed.')
      setPhase('form')
    }
  }

  const busy = phase === 'running'

  return (
    <Modal
      description="Points WhatsApp, Messenger and Telegram at the public URL below. Use this after your Cloudflare tunnel restarts."
      dismissible={!busy}
      footer={phase === 'done' ? (
        <Button variant="primary" onClick={onClose}>Done</Button>
      ) : (
        <>
          <Button disabled={busy} onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || phase === 'loading' || !url.trim()}
            icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            onClick={() => void handleReconnect()}
            variant="primary"
          >
            {busy ? 'Reconnecting…' : 'Reconnect'}
          </Button>
        </>
      )}
      onClose={onClose}
      size="xl"
      title="Reconnect all channels"
    >
      {phase === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-calisto-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Looking for your tunnel URL…
        </div>
      )}

      {(phase === 'form' || phase === 'running') && (
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-calisto-ink">Public HTTPS URL</span>
          <input
            className="h-11 w-full rounded-xl border border-calisto-line bg-calisto-surface px-4 text-sm text-calisto-ink outline-none focus:border-calisto-accent/50 focus:ring-4 focus:ring-calisto-focus disabled:bg-calisto-table"
            disabled={busy}
            onChange={(event) => {
              setUrl(event.target.value)
              setUrlSource(null)
            }}
            placeholder="https://your-tunnel.trycloudflare.com"
            value={url}
          />
          <span className="mt-2 block text-xs leading-5 text-calisto-muted">
            {urlSource === 'tunnel' && 'Detected from your running Cloudflare tunnel.'}
            {urlSource === 'current' && 'The URL the backend is currently using. No running tunnel was detected.'}
            {urlSource === null && 'Enter the https:// URL where this backend is reachable from the internet.'}
          </span>
        </label>
      )}

      {phase === 'running' && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-calisto-table px-4 py-3 text-sm text-calisto-body">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          Reconnecting channels. This takes a few seconds per channel…
        </div>
      )}

      {error && (
        <div className="mt-4 flex gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {phase === 'done' && result && (
        <div>
          <p className="text-sm text-calisto-body">
            Using <span className="break-all font-semibold text-calisto-ink">{result.publicBaseUrl}</span>
          </p>
          {result.results.length === 0 ? (
            <p className="mt-4 text-sm text-calisto-muted">There are no enabled channel accounts.</p>
          ) : (
            <ul className="mt-4 divide-y divide-calisto-line-subtle rounded-xl border border-calisto-line">
              {result.results.map((item) => (
                <ResultRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}

function ResultRow({ item }: { item: WebhookRegistrationResult }) {
  const snackbar = useSnackbar()

  async function copyUrl() {
    if (!item.webhookUrl) return
    try {
      await navigator.clipboard.writeText(item.webhookUrl)
      snackbar.success('Webhook URL copied.')
    } catch {
      snackbar.error('Could not copy. Select the URL and copy it manually.')
    }
  }

  return (
    <li className="flex gap-3 px-4 py-3">
      {item.status === 'active' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
      {item.status === 'error' && <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />}
      {item.status === 'manual' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-calisto-ink">{item.label}</span>
          <span className="text-xs text-calisto-muted">{channelName(item.channel)}</span>
        </div>
        {item.status === 'active' && <p className="mt-0.5 text-sm text-calisto-body">Connected</p>}
        {item.status === 'error' && <p className="mt-0.5 break-words text-sm leading-6 text-rose-700">{item.error}</p>}
        {item.status === 'manual' && (
          <div className="mt-1 text-sm leading-6 text-calisto-body">
            <p>Instagram can't be set automatically. Paste this callback URL in the Meta App Dashboard (Webhooks → Instagram):</p>
            {item.webhookUrl && (
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-calisto-table px-2.5 py-1.5 text-xs text-calisto-ink">
                  {item.webhookUrl}
                </code>
                <button
                  aria-label="Copy webhook URL"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-calisto-line text-calisto-body transition hover:bg-calisto-surface-muted"
                  onClick={() => void copyUrl()}
                  title="Copy"
                  type="button"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            )}
            <a
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-calisto-accent hover:underline"
              href={META_APPS_DASHBOARD}
              rel="noreferrer"
              target="_blank"
            >
              Open Meta App Dashboard <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </li>
  )
}
