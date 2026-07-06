import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Link2, Plus, Power } from 'lucide-react'
import {
  createChannelAccount,
  disableChannelAccount,
  getChannelAccounts,
  registerChannelAccountWebhook,
  updateChannelAccount,
} from '../api/client'
import AddChannelAccountModal from '../components/AddChannelAccountModal'
import Button from '../components/Button'
import PageContainer from '../components/PageContainer'
import { SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import Topbar from '../components/Topbar'
import type { ChannelAccountInput, ChannelAccountRecord } from '../types'

function statusTone(status: ChannelAccountRecord['webhookStatus']) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700'
  if (status === 'error') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

function channelLabel(channel: ChannelAccountRecord['channel']) {
  return channel.charAt(0).toUpperCase() + channel.slice(1)
}

export default function ChannelsPage() {
  const [items, setItems] = useState<ChannelAccountRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [registerTarget, setRegisterTarget] = useState<ChannelAccountRecord | null>(null)
  const [registerUrl, setRegisterUrl] = useState('')
  const [tokenTarget, setTokenTarget] = useState<ChannelAccountRecord | null>(null)
  const [tokenValue, setTokenValue] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getChannelAccounts()
      setItems(result.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channel accounts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(payload: ChannelAccountInput) {
    setSaving(true)
    try {
      await createChannelAccount(payload)
      setShowAddModal(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisable(account: ChannelAccountRecord) {
    if (!window.confirm(`Disable "${account.label}"? Existing lead history is kept.`)) return
    setBusyId(account.id)
    try {
      await disableChannelAccount(account.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable account')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRegisterWebhook(account: ChannelAccountRecord) {
    setRegisterTarget(account)
    setRegisterUrl('')
  }

  async function confirmRegisterWebhook() {
    if (!registerTarget) return
    setBusyId(registerTarget.id)
    try {
      const url = registerUrl.trim() || undefined
      await registerChannelAccountWebhook(registerTarget.id, url)
      setRegisterTarget(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Webhook registration failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleUpdateToken(account: ChannelAccountRecord) {
    setTokenTarget(account)
    setTokenValue('')
  }

  async function confirmUpdateToken() {
    if (!tokenTarget || !tokenValue.trim()) return
    setBusyId(tokenTarget.id)
    try {
      const key = tokenTarget.channel === 'whatsapp'
        ? 'accessToken'
        : tokenTarget.channel === 'messenger'
          ? 'pageAccessToken'
          : tokenTarget.channel === 'instagram'
            ? 'accessToken'
            : 'botToken'
      await updateChannelAccount(tokenTarget.id, {
        credentials: { [key]: tokenValue.trim() },
      })
      setTokenTarget(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credentials')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PageContainer>
      {loading ? <SkeletonTopbar /> : (
        <Topbar
          title="Channels"
          actions={(
            <Button icon={<Plus className="h-4 w-4" />} variant="primary" onClick={() => setShowAddModal(true)}>
              Add account
            </Button>
          )}
        />
      )}

      {!loading && (
        <p className="-mt-3 mb-6 text-sm text-calisto-body">
          Manage WhatsApp, Instagram, Messenger, and Telegram business accounts.
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? <SkeletonTable rows={5} cols={6} /> : (
        <div className="overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-calisto-table text-xs font-semibold uppercase tracking-wide text-calisto-body">
              <tr>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Native ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Webhook</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-calisto-body" colSpan={6}>
                    No channel accounts yet. Add one to connect WhatsApp, Instagram, Messenger, or Telegram.
                  </td>
                </tr>
              ) : items.map((account) => (
                <tr key={account.id} className="border-t border-calisto-line">
                  <td className="px-4 py-4 font-semibold text-calisto-ink">
                    {account.label}
                    {!account.enabled && (
                      <span className="ml-2 rounded-full bg-calisto-table px-2 py-0.5 text-xs font-medium text-calisto-body">
                        disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-calisto-body">{channelLabel(account.channel)}</td>
                  <td className="px-4 py-4 font-mono text-xs text-calisto-body">{account.nativeId}</td>
                  <td className="px-4 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-calisto-table text-calisto-body'}`}>
                      {account.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(account.webhookStatus)}`}>
                        {account.webhookStatus}
                      </span>
                      {account.webhookError && (
                        <p className="max-w-xs text-xs text-rose-600">{account.webhookError}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      {account.enabled && (
                        <Button
                          icon={<KeyRound className="h-4 w-4" />}
                          disabled={busyId === account.id}
                          onClick={() => handleUpdateToken(account)}
                        >
                          Update token
                        </Button>
                      )}
                      {account.enabled && (
                        <Button
                          icon={<Link2 className="h-4 w-4" />}
                          disabled={busyId === account.id}
                          onClick={() => void handleRegisterWebhook(account)}
                        >
                          Register webhook
                        </Button>
                      )}
                      {account.enabled && (
                        <Button
                          icon={<Power className="h-4 w-4" />}
                          variant="ghost"
                          disabled={busyId === account.id}
                          onClick={() => void handleDisable(account)}
                        >
                          Disable
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddChannelAccountModal
        open={showAddModal}
        saving={saving}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreate}
      />

      {registerTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl border border-calisto-line bg-calisto-surface p-6 shadow-dashboard">
            <h2 className="text-lg font-bold text-calisto-ink">Register webhook</h2>
            <p className="mt-2 text-sm leading-6 text-calisto-body">
              Register webhook for <strong>{registerTarget.label}</strong>. Your backend must be reachable over HTTPS (e.g. via Cloudflare tunnel).
            </p>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-calisto-ink">Public HTTPS base URL (optional)</span>
              <input
                className="h-11 w-full rounded-xl border border-calisto-line px-4 text-sm"
                placeholder="https://your-tunnel.trycloudflare.com"
                value={registerUrl}
                onChange={(event) => setRegisterUrl(event.target.value)}
              />
              <span className="mt-2 block text-xs text-calisto-body">
                Leave empty to use PUBLIC_BASE_URL from the server .env. Use this field if your tunnel URL changed and you have not restarted the backend yet.
              </span>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRegisterTarget(null)}>Cancel</Button>
              <Button variant="primary" disabled={busyId === registerTarget.id} onClick={() => void confirmRegisterWebhook()}>
                {busyId === registerTarget.id ? 'Registering…' : 'Register'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {tokenTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/50 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl border border-calisto-line bg-calisto-surface p-6 shadow-dashboard">
            <h2 className="text-lg font-bold text-calisto-ink">Update access token</h2>
            <p className="mt-2 text-sm leading-6 text-calisto-body">
              Paste a fresh token for <strong>{tokenTarget.label}</strong> from Meta Developer Dashboard or BotFather.
            </p>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-calisto-ink">New token</span>
              <input
                className="h-11 w-full rounded-xl border border-calisto-line px-4 text-sm"
                type="password"
                value={tokenValue}
                onChange={(event) => setTokenValue(event.target.value)}
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setTokenTarget(null)}>Cancel</Button>
              <Button variant="primary" disabled={!tokenValue.trim() || busyId === tokenTarget.id} onClick={() => void confirmUpdateToken()}>
                {busyId === tokenTarget.id ? 'Saving…' : 'Save token'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
