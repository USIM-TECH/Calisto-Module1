import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Copy, KeyRound, Link2, Plus, Power, RefreshCw } from 'lucide-react'
import {
  createChannelAccount,
  disableChannelAccount,
  enableChannelAccount,
  getChannelAccounts,
  registerChannelAccountWebhook,
  updateChannelAccount,
} from '../api/client'
import ActionMenu from '../components/ActionMenu'
import AddChannelAccountModal from '../components/AddChannelAccountModal'
import EmptyState from '../components/EmptyState'
import { ChannelIcon } from '../components/ChannelIcon'
import ReconnectChannelsModal from '../components/ReconnectChannelsModal'
import Button from '../components/Button'
import PageContainer from '../components/PageContainer'
import Modal from '../components/Modal'
import RequiredMark from '../components/RequiredMark'
import ResponseModeSelect, { RESPONSE_MODE_HELP } from '../components/ResponseModeSelect'
import Pagination from '../components/Pagination'
import { SkeletonTable, SkeletonTopbar } from '../components/Skeleton'
import Topbar from '../components/Topbar'
import { useSnackbar } from '../components/Snackbar'
import type { ChannelAccountInput, ChannelAccountRecord, ResponseMode } from '../types'
import { pageSlice, useTablePaging } from '../lib/table-paging'

const WEBHOOK_STATUS = {
  active: { label: 'Webhook active', tone: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  pending: { label: 'Setup needed', tone: 'bg-amber-100 text-amber-700', Icon: Clock },
  error: { label: 'Failed', tone: 'bg-rose-100 text-rose-700', Icon: AlertCircle },
} as const

const CHANNEL_META: Record<ChannelAccountRecord['channel'], { name: string; color: string }> = {
  whatsapp: { name: 'WhatsApp', color: 'text-emerald-600' },
  instagram: { name: 'Instagram', color: 'text-purple-600' },
  messenger: { name: 'Messenger', color: 'text-blue-600' },
  telegram: { name: 'Telegram', color: 'text-sky-600' },
}

const ROW_HEIGHT_PX = 60

export default function ChannelsPage() {
  const [items, setItems] = useState<ChannelAccountRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const snackbar = useSnackbar()
  const tableHeaderRef = useRef<HTMLTableSectionElement | null>(null)
  const paging = useTablePaging(tableHeaderRef, !loading)
  const rowsPerPage = paging.rowsPerPage
  // Page lives in the URL, like the Leads page.
  const [params, setParams] = useSearchParams()
  const { pageCount, currentPage, pageItems, visibleStart, visibleEnd } = pageSlice(items, rowsPerPage, Number(params.get('page')))

  function goToPage(page: number) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (page <= 1) next.delete('page')
      else next.set('page', String(page))
      return next
    }, { replace: true })
  }
  const [showAddModal, setShowAddModal] = useState(false)
  const [showReconnect, setShowReconnect] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [registerTarget, setRegisterTarget] = useState<ChannelAccountRecord | null>(null)
  const [registerUrl, setRegisterUrl] = useState('')
  const [tokenTarget, setTokenTarget] = useState<ChannelAccountRecord | null>(null)
  const [tokenValue, setTokenValue] = useState('')
  const [telegramSecretToken, setTelegramSecretToken] = useState('')
  const [webhookInfoTarget, setWebhookInfoTarget] = useState<ChannelAccountRecord | null>(null)

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
      snackbar.success(`Added ${payload.label}.`)
      await load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisable(account: ChannelAccountRecord) {
    if (!window.confirm(`Disable "${account.label}"? Existing lead history is kept.`)) return
    setBusyId(account.id)
    try {
      await disableChannelAccount(account.id)
      snackbar.success(`Disabled ${account.label}.`)
      await load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to disable account')
    } finally {
      setBusyId(null)
    }
  }

  async function handleEnable(account: ChannelAccountRecord) {
    if (!window.confirm(`Re-enable "${account.label}"? Webhooks will start accepting messages again.`)) return
    setBusyId(account.id)
    try {
      await enableChannelAccount(account.id)
      snackbar.success(`Enabled ${account.label}.`)
      await load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to enable account')
    } finally {
      setBusyId(null)
    }
  }

  async function handleResponseMode(account: ChannelAccountRecord, responseMode: ResponseMode) {
    setBusyId(account.id)
    try {
      const updated = await updateChannelAccount(account.id, { responseMode })
      setItems((current) => current.map((item) => (item.id === account.id ? { ...item, responseMode: updated.responseMode } : item)))
      snackbar.success(`${account.label} now uses ${responseMode === 'chat' ? 'Chat' : 'Payload'} mode.`)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to change response mode')
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
      snackbar.success(`Webhook registered for ${registerTarget.label}.`)
      setRegisterTarget(null)
      await load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Webhook registration failed')
    } finally {
      setBusyId(null)
    }
  }

  async function copyToClipboard(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value)
      snackbar.success(`${what} copied.`)
    } catch {
      snackbar.error('Could not copy to clipboard')
    }
  }

  async function handleUpdateToken(account: ChannelAccountRecord) {
    setTokenTarget(account)
    setTokenValue('')
    setTelegramSecretToken('')
  }

  async function confirmUpdateToken() {
    if (!tokenTarget || !tokenValue.trim() || (tokenTarget.channel === 'telegram' && !telegramSecretToken.trim())) return
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
        credentials: tokenTarget.channel === 'telegram'
          ? { botToken: tokenValue.trim(), secretToken: telegramSecretToken.trim() }
          : { [key]: tokenValue.trim() },
      })
      snackbar.success(`Credentials updated for ${tokenTarget.label}.`)
      setTokenTarget(null)
      await load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : 'Failed to update credentials')
    } finally {
      setBusyId(null)
    }
  }

  return (
    // On desktop the page fills the screen and the table card stretches to the bottom.
    <PageContainer className="lg:flex lg:h-[100dvh] lg:flex-col">
      {loading ? <SkeletonTopbar /> : (
        <Topbar
          title="Channels"
          actions={(
            <>
              <Button
                disabled={items.every((account) => !account.enabled)}
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() => setShowReconnect(true)}
                title="Point every enabled channel at the current public URL (e.g. after the tunnel restarts)"
              >
                Reconnect all
              </Button>
              <Button icon={<Plus className="h-4 w-4" />} variant="primary" onClick={() => setShowAddModal(true)}>
                Add account
              </Button>
            </>
          )}
        />
      )}

      {!loading && (
        <p className="-mt-3 mb-6 text-sm text-calisto-body">
          Manage WhatsApp, Instagram, Messenger, and Telegram business accounts. Response mode sets how each one answers:
          {' '}<strong>Payload</strong> is the guided flow with buttons; <strong>Chat</strong> is a free-text assistant for Calisto products.
        </p>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? <SkeletonTable rows={5} cols={7} /> : (
        <div className="flex flex-col overflow-hidden rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard lg:min-h-0 lg:flex-1">
          <div className="table-scroll flex flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto" {...paging.scrollProps}>
          {/* Fixed layout + one-line cells: the table fits the width and every row is the same height. */}
          <table className="table-edges w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[11%]" />
              <col className="w-[18%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-calisto-table text-xs font-semibold uppercase tracking-wide text-calisto-body" ref={tableHeaderRef}>
              <tr>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Native ID</th>
                <th className="px-4 py-3" title="How this account answers customers">Response mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Webhook</th>
                <th className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((account) => {
                const { label, tone, Icon } = WEBHOOK_STATUS[account.webhookStatus]
                const busy = busyId === account.id
                // Disabled accounts are dimmed, except the actions menu (it holds "Enable").
                const dim = account.enabled ? '' : 'opacity-50'
                return (
                  <tr
                    className="border-y border-calisto-line"
                    key={account.id}
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    <td className={`truncate px-4 font-semibold text-calisto-ink ${dim}`} title={account.label}>
                      {account.label}
                    </td>
                    <td className={`px-4 text-calisto-body ${dim}`}>
                      <span className="inline-flex max-w-full items-center gap-2">
                        <span className={`shrink-0 ${CHANNEL_META[account.channel].color}`}>
                          <ChannelIcon channel={account.channel} className="h-4 w-4" />
                        </span>
                        <span className="truncate">{CHANNEL_META[account.channel].name}</span>
                      </span>
                    </td>
                    <td className={`truncate px-4 tabular-nums text-calisto-body ${dim}`} title={account.nativeId}>
                      {account.nativeId}
                    </td>
                    <td className={`px-4 ${dim}`} title={RESPONSE_MODE_HELP[account.responseMode]}>
                      <ResponseModeSelect
                        aria-label={`Response mode for ${account.label}`}
                        compact
                        disabled={busy || !account.enabled}
                        onChange={(mode) => void handleResponseMode(account, mode)}
                        value={account.responseMode}
                      />
                    </td>
                    <td className={`px-4 ${dim}`}>
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${account.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-calisto-table text-calisto-body'}`}>
                        {account.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </td>
                    <td className={`px-4 ${dim}`}>
                      {account.webhookStatus === 'active' ? (
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </span>
                      ) : (
                        // Not connected: the badge itself opens the details (no second line).
                        <button
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-calisto-accent/40 ${tone}`}
                          onClick={() => setWebhookInfoTarget(account)}
                          title={account.webhookStatus === 'error' ? 'View details' : 'Finish setup'}
                          type="button"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                          <ChevronRight className="-mr-0.5 h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 text-right">
                      <ActionMenu
                        disabled={busy}
                        items={account.enabled ? [
                          { label: 'Update token', icon: <KeyRound className="h-4 w-4" />, onSelect: () => handleUpdateToken(account) },
                          { label: 'Register webhook', icon: <Link2 className="h-4 w-4" />, onSelect: () => void handleRegisterWebhook(account) },
                          { label: 'Disable', icon: <Power className="h-4 w-4" />, onSelect: () => void handleDisable(account), tone: 'danger' },
                        ] : [
                          { label: 'Enable', icon: <Power className="h-4 w-4" />, onSelect: () => void handleEnable(account), tone: 'primary' },
                        ]}
                        label={`Actions for ${account.label}`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {items.length === 0 && <EmptyState />}
          </div>
          {items.length > 0 && (
            <Pagination
              {...paging.pagination}
              currentPage={currentPage}
              onNextPage={() => goToPage(currentPage + 1)}
              onPreviousPage={() => goToPage(currentPage - 1)}
              pageCount={pageCount}
              totalCount={items.length}
              visibleEnd={visibleEnd}
              visibleStart={visibleStart}
            />
          )}
        </div>
      )}

      <ReconnectChannelsModal
        open={showReconnect}
        onClose={() => setShowReconnect(false)}
        onFinished={() => void load()}
      />

      <AddChannelAccountModal
        open={showAddModal}
        saving={saving}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreate}
      />

      {registerTarget && (
        <Modal
          description={<>Register webhook for <strong>{registerTarget.label}</strong>. Your backend must be reachable over HTTPS (e.g. via Cloudflare tunnel).</>}
          dismissible={busyId !== registerTarget.id}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setRegisterTarget(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={busyId === registerTarget.id}>
                {busyId === registerTarget.id ? 'Registering…' : 'Register'}
              </Button>
            </>
          )}
          onClose={() => setRegisterTarget(null)}
          onSubmit={(event) => {
            event.preventDefault()
            void confirmRegisterWebhook()
          }}
          size="md"
          title="Register webhook"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-calisto-ink">Public HTTPS base URL (optional)</span>
            <input
              className="h-11 w-full rounded-xl border border-calisto-line px-4 text-sm"
              placeholder="https://your-tunnel.trycloudflare.com"
              value={registerUrl}
              onChange={(event) => setRegisterUrl(event.target.value)}
            />
            <span className="mt-2 block text-xs text-calisto-body">
              Leave empty to use the backend's current public URL. Tip: after a tunnel restart, use “Reconnect all” to update every channel at once.
            </span>
          </label>
        </Modal>
      )}

      {webhookInfoTarget && (
        <Modal
          description={webhookInfoTarget.webhookStatus === 'error'
            ? <><strong>{webhookInfoTarget.label}</strong> can't receive messages until its webhook is registered.</>
            : webhookInfoTarget.channel === 'instagram'
              ? <>Meta doesn't allow Instagram webhooks to be set automatically. Add the values below in your Meta App Dashboard under <strong>Webhooks → Instagram</strong>, then subscribe to the <strong>messages</strong> field.</>
              : <>Register the webhook for <strong>{webhookInfoTarget.label}</strong> to start receiving messages.</>}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setWebhookInfoTarget(null)}>Close</Button>
              {(webhookInfoTarget.webhookStatus === 'error' || webhookInfoTarget.channel !== 'instagram') && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const target = webhookInfoTarget
                    setWebhookInfoTarget(null)
                    void handleRegisterWebhook(target)
                  }}
                >
                  Register webhook
                </Button>
              )}
            </>
          )}
          onClose={() => setWebhookInfoTarget(null)}
          size="md"
          title={webhookInfoTarget.webhookStatus === 'error' ? 'Webhook registration failed' : 'Finish webhook setup'}
        >
          {webhookInfoTarget.webhookStatus === 'error' ? (
            <>
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {webhookInfoTarget.webhookError || 'Unknown error.'}
              </div>
              <p className="mt-4 text-sm leading-6 text-calisto-body">
                If the token expired, use <strong>Update token</strong> first, then try registering again.
              </p>
            </>
          ) : (
            <>
              {webhookInfoTarget.webhookUrl && (
                <div className="space-y-3">
                  {[
                    { name: 'Callback URL', value: webhookInfoTarget.webhookUrl },
                    ...(webhookInfoTarget.verifyToken ? [{ name: 'Verify token', value: webhookInfoTarget.verifyToken }] : []),
                  ].map((field) => (
                    <div key={field.name}>
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-calisto-body">{field.name}</span>
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-xl border border-calisto-line bg-calisto-table px-3 py-2 text-xs text-calisto-ink">
                          {field.value}
                        </code>
                        <Button icon={<Copy className="h-4 w-4" />} onClick={() => void copyToClipboard(field.value, field.name)}>
                          Copy
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs leading-5 text-calisto-body">
                A registered webhook is not an end-to-end message test. Send and verify an inbound customer message before treating this account as operational.
              </p>
            </>
          )}
        </Modal>
      )}

      {tokenTarget && (
        <Modal
          description={tokenTarget.channel === 'telegram'
            ? <>Paste the rotated BotFather token and a new webhook secret for <strong>{tokenTarget.label}</strong>.</>
            : <>Paste a fresh token for <strong>{tokenTarget.label}</strong> from Meta Developer Dashboard.</>}
          dismissible={busyId !== tokenTarget.id}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setTokenTarget(null)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!tokenValue.trim() || (tokenTarget.channel === 'telegram' && !telegramSecretToken.trim()) || busyId === tokenTarget.id}>
                {busyId === tokenTarget.id ? 'Saving…' : 'Save token'}
              </Button>
            </>
          )}
          onClose={() => setTokenTarget(null)}
          onSubmit={(event) => {
            event.preventDefault()
            void confirmUpdateToken()
          }}
          size="md"
          title={tokenTarget.channel === 'telegram' ? 'Update Telegram credentials' : 'Update access token'}
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-calisto-ink">{tokenTarget.channel === 'telegram' ? 'New BotFather token' : 'New token'}<RequiredMark /></span>
            <input
              className="h-11 w-full rounded-xl border border-calisto-line px-4 text-sm"
              type="password"
              value={tokenValue}
              onChange={(event) => setTokenValue(event.target.value)}
            />
          </label>
          {tokenTarget.channel === 'telegram' && (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-calisto-ink">Webhook secret token<RequiredMark /></span>
              <input
                className="h-11 w-full rounded-xl border border-calisto-line px-4 text-sm"
                type="password"
                value={telegramSecretToken}
                onChange={(event) => setTelegramSecretToken(event.target.value)}
              />
              <span className="mt-2 block text-xs text-calisto-body">Use 1–256 letters, numbers, underscores, or hyphens. Telegram sends it with every webhook request.</span>
            </label>
          )}
        </Modal>
      )}
    </PageContainer>
  )
}
