import { FormEvent, useEffect, useState } from 'react'
import Button from './Button'
import Modal from './Modal'
import RequiredMark from './RequiredMark'
import Select from './Select'
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

const CHANNELS = Object.keys(channelLabels) as ManagedChannel[]

type Credentials = ChannelAccountInput['credentials']

const emptyCredentials = (channel: ManagedChannel): Credentials =>
  channel === 'whatsapp'
    ? { accessToken: '', phoneNumberId: '', clientSecret: '', wabaId: '' }
    : channel === 'instagram'
      ? { accessToken: '', instagramId: '', clientId: '', clientSecret: '' }
      : channel === 'messenger'
        ? { pageAccessToken: '', pageId: '', clientId: '', clientSecret: '', appToken: '' }
        : { botToken: '', secretToken: '', apiBaseUrl: '' }

// One credentials draft per channel, so switching channel and back keeps what was typed.
const emptyDrafts = (): Record<ManagedChannel, Credentials> =>
  Object.fromEntries(CHANNELS.map((channel) => [channel, emptyCredentials(channel)])) as Record<ManagedChannel, Credentials>

const OPTIONAL_CREDENTIALS = ['wabaId', 'appToken', 'apiBaseUrl']

function credentialFieldsFor(channel: ManagedChannel): Array<{ key: string; label: string; secret?: boolean }> {
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
        { key: 'secretToken', label: 'Webhook secret token', secret: true },
        { key: 'apiBaseUrl', label: 'API base URL (optional)' },
      ]
    default:
      return []
  }
}

const inputClass = 'h-11 w-full rounded-xl border border-calisto-line px-4 text-sm'
const inputErrorClass = 'h-11 w-full rounded-xl border border-rose-400 px-4 text-sm'
const errorTextClass = 'mt-1.5 block text-xs font-medium text-rose-600'
const labelTextClass = 'mb-2 block text-sm font-semibold text-calisto-ink'
const sectionTitleClass = 'text-xs font-bold uppercase tracking-wider text-calisto-muted'

export default function AddChannelAccountModal({ open, saving, onClose, onSubmit }: Props) {
  const [channel, setChannel] = useState<ManagedChannel>('whatsapp')
  // Label and verify token don't depend on the channel, so they survive a channel switch.
  const [label, setLabel] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [drafts, setDrafts] = useState(emptyDrafts)
  // Fields the user has left at least once (keys: 'label', 'verifyToken', '<channel>.<field>').
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Every time the dialog opens, start from a clean form (not the last account added).
  useEffect(() => {
    if (!open) return
    setChannel('whatsapp')
    setLabel('')
    setVerifyToken('')
    setDrafts(emptyDrafts())
    setTouched({})
  }, [open])


  if (!open) return null

  function updateCredential(target: ManagedChannel, key: string, value: string) {
    setDrafts((current) => ({
      ...current,
      [target]: { ...current[target], [key]: value },
    }))
  }

  // Problems for the selected channel only (other channels' fields are hidden and not sent).
  const allErrors: Record<string, string> = {}
  if (!label.trim()) allErrors.label = 'Label is required.'
  if (channel !== 'telegram' && !verifyToken.trim()) allErrors.verifyToken = 'Webhook verify token is required.'
  for (const field of credentialFieldsFor(channel)) {
    const value = String((drafts[channel] as Record<string, string | undefined>)[field.key] ?? '')
    if (!OPTIONAL_CREDENTIALS.includes(field.key) && !value.trim()) {
      allErrors[`${channel}.${field.key}`] = `${field.label} is required.`
    }
  }
  const isValid = Object.keys(allErrors).length === 0
  const errorFor = (key: string) => (touched[key] ? allErrors[key] : undefined)
  const touch = (key: string) => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValid) {
      setTouched((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(allErrors).map((key) => [key, true])) }))
      return
    }
    await onSubmit({
      label,
      channel,
      verifyToken: channel === 'telegram' ? '' : verifyToken,
      metaAppId: '',
      apiVersion: '',
      credentials: drafts[channel],
    })
  }

  return (
    <Modal
      dismissible={!saving}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !isValid}>{saving ? 'Saving…' : 'Add account'}</Button>
        </>
      )}
      onClose={onClose}
      onSubmit={handleSubmit}
      title="Add channel account"
    >
      <div className="space-y-6">
        {/* 1. Pick the platform first: it decides which fields follow. */}
        <section className="space-y-4">
          <h3 className={sectionTitleClass}>Account</h3>
          <label className="block">
            <span className={labelTextClass}>Channel<RequiredMark /></span>
            <Select
              aria-label="Channel"
              fullWidth
              onChange={(value) => setChannel(value as ManagedChannel)}
              options={CHANNELS.map((value) => ({ value, label: channelLabels[value] }))}
              value={channel}
            />
          </label>
          <label className="block">
            <span className={labelTextClass}>Label<RequiredMark /></span>
            <input
              className={errorFor('label') ? inputErrorClass : inputClass}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              onBlur={() => touch('label')}
              placeholder={`Calisto KL ${channelLabels[channel]}`}
              required
            />
            {errorFor('label') && <span className={errorTextClass}>{errorFor('label')}</span>}
          </label>
        </section>

        {/* Every platform's fields share one grid cell; only the selected one is
            visible. The cell is as tall as the largest platform, so the dialog keeps
            the same height when switching. Hidden ones are disabled (not validated). */}
        <div className="grid">
          {CHANNELS.map((option) => {
            const active = option === channel
            const values = drafts[option] as Record<string, string | undefined>
            return (
              <fieldset
                aria-hidden={!active}
                className={`col-start-1 row-start-1 min-w-0 space-y-6 ${active ? '' : 'invisible'}`}
                disabled={!active}
                key={option}
              >
                {option !== 'telegram' && (
                  <section className="space-y-4 border-t border-calisto-line-subtle pt-5">
                    <h3 className={sectionTitleClass}>Webhook</h3>
                    <label className="block">
                      <span className={labelTextClass}>Webhook verify token<RequiredMark /></span>
                      <input
                        className={active && errorFor('verifyToken') ? inputErrorClass : inputClass}
                        value={verifyToken}
                        onChange={(event) => setVerifyToken(event.target.value)}
                        onBlur={() => touch('verifyToken')}
                        required
                      />
                      {active && errorFor('verifyToken') && <span className={errorTextClass}>{errorFor('verifyToken')}</span>}
                    </label>
                  </section>
                )}

                <section className="space-y-4 border-t border-calisto-line-subtle pt-5">
                  <h3 className={sectionTitleClass}>{channelLabels[option]} credentials</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {credentialFieldsFor(option).map((field) => (
                      <label key={field.key} className="block">
                        <span className={labelTextClass}>
                          {field.label}
                          {!OPTIONAL_CREDENTIALS.includes(field.key) && <RequiredMark />}
                        </span>
                        <input
                          className={errorFor(`${option}.${field.key}`) ? inputErrorClass : inputClass}
                          type={field.secret ? 'password' : 'text'}
                          value={String(values[field.key] ?? '')}
                          onChange={(event) => updateCredential(option, field.key, event.target.value)}
                          onBlur={() => touch(`${option}.${field.key}`)}
                          required={!OPTIONAL_CREDENTIALS.includes(field.key)}
                        />
                        {errorFor(`${option}.${field.key}`) && (
                          <span className={errorTextClass}>{errorFor(`${option}.${field.key}`)}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              </fieldset>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
