import { FormEvent, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import Button from './Button'
import type { ChannelAccountInput, ManagedChannel } from '../types'

interface Props {
  open: boolean
  saving: boolean
  onClose: () => void
  onSubmit: (payload: ChannelAccountInput) => Promise<void>
}

const channelLabels: Record<ManagedChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  telegram: 'Telegram',
}

const emptyForm = (channel: ManagedChannel): ChannelAccountInput => ({
  label: '',
  channel,
  verifyToken: '',
  metaAppId: '',
  apiVersion: '',
  credentials: channel === 'whatsapp'
    ? { accessToken: '', phoneNumberId: '', clientSecret: '', wabaId: '' }
    : channel === 'instagram'
      ? { accessToken: '', instagramId: '', clientId: '', clientSecret: '' }
      : channel === 'messenger'
        ? { pageAccessToken: '', pageId: '', clientId: '', clientSecret: '', appToken: '' }
        : { botToken: '', secretToken: '', apiBaseUrl: '' },
})

export default function AddChannelAccountModal({ open, saving, onClose, onSubmit }: Props) {
  const [channel, setChannel] = useState<ManagedChannel>('whatsapp')
  const [form, setForm] = useState<ChannelAccountInput>(emptyForm('whatsapp'))

  const credentialFields = useMemo(() => {
    switch (channel) {
      case 'whatsapp':
        return [
          { key: 'accessToken', label: 'Access token', secret: true },
          { key: 'phoneNumberId', label: 'Phone number ID' },
          { key: 'clientId', label: 'Meta App ID' },
          { key: 'clientSecret', label: 'Meta App client secret', secret: true },
          { key: 'wabaId', label: 'WABA ID (optional)' },
        ]
      case 'instagram':
        return [
          { key: 'accessToken', label: 'Access token', secret: true },
          { key: 'instagramId', label: 'Instagram business account ID' },
          { key: 'clientId', label: 'Meta app ID' },
          { key: 'clientSecret', label: 'Client secret', secret: true },
        ]
      case 'messenger':
        return [
          { key: 'pageAccessToken', label: 'Page access token', secret: true },
          { key: 'pageId', label: 'Page ID' },
          { key: 'clientId', label: 'Meta app ID' },
          { key: 'clientSecret', label: 'Client secret', secret: true },
          { key: 'appToken', label: 'App token (optional)', secret: true },
        ]
      case 'telegram':
        return [
          { key: 'botToken', label: 'Bot token', secret: true },
          { key: 'secretToken', label: 'Webhook secret token (recommended)', secret: true },
          { key: 'apiBaseUrl', label: 'API base URL (optional)' },
        ]
      default:
        return []
    }
  }, [channel])

  if (!open) return null

  function updateCredential(key: string, value: string) {
    setForm((current) => ({
      ...current,
      credentials: { ...current.credentials, [key]: value },
    }))
  }

  function handleChannelChange(next: ManagedChannel) {
    setChannel(next)
    setForm(emptyForm(next))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    await onSubmit(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-calisto-ink/50 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-calisto-line bg-calisto-surface shadow-dashboard">
        <div className="flex items-center justify-between border-b border-calisto-line px-6 py-4">
          <h2 className="text-lg font-bold text-calisto-ink">Add channel account</h2>
          <button type="button" className="rounded-lg p-2 text-calisto-body hover:bg-calisto-surface-muted" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="space-y-5 px-6 py-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-calisto-ink">Label</span>
            <input
              className="h-11 w-full rounded-xl border border-calisto-line px-4 text-sm"
              value={form.label}
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="Calisto KL WhatsApp"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-calisto-ink">Channel</span>
            <select
              className="h-11 w-full rounded-xl border border-calisto-line px-4 text-sm"
              value={channel}
              onChange={(event) => handleChannelChange(event.target.value as ManagedChannel)}
            >
              {(Object.keys(channelLabels) as ManagedChannel[]).map((value) => (
                <option key={value} value={value}>{channelLabels[value]}</option>
              ))}
            </select>
          </label>

          {channel !== 'telegram' && (
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-calisto-ink">Webhook verify token</span>
              <input
                className="h-11 w-full rounded-xl border border-calisto-line px-4 text-sm"
                value={form.verifyToken ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, verifyToken: event.target.value }))}
                required
              />
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {credentialFields.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-2 block text-sm font-semibold text-calisto-ink">{field.label}</span>
                <input
                  className="h-11 w-full rounded-xl border border-calisto-line px-4 text-sm"
                  type={field.secret ? 'password' : 'text'}
                  value={String((form.credentials as Record<string, string | undefined>)[field.key] ?? '')}
                  onChange={(event) => updateCredential(field.key, event.target.value)}
                  required={!field.key.includes('optional') && !['wabaId', 'appToken', 'secretToken', 'apiBaseUrl'].includes(field.key)}
                />
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-3 border-t border-calisto-line pt-5">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Add account'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
