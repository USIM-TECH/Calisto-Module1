import type { ChannelIdentityRecord } from '../types'

interface ChannelBadgeProps {
  identity: ChannelIdentityRecord
}

const labels: Record<ChannelIdentityRecord['channel'], string> = {
  instagram: 'IG',
  messenger: 'MS',
  telegram: 'TG',
  website: 'WEB',
  whatsapp: 'WA',
  x: 'X',
}

const colors: Record<ChannelIdentityRecord['channel'], string> = {
  instagram: 'text-purple-700',
  messenger: 'text-blue-700',
  telegram: 'text-sky-700',
  website: 'text-teal-700',
  whatsapp: 'text-emerald-700',
  x: 'text-slate-700',
}

export function channelName(channel: ChannelIdentityRecord['channel']) {
  const names: Record<ChannelIdentityRecord['channel'], string> = {
    instagram: 'Instagram',
    messenger: 'Messenger',
    telegram: 'Telegram',
    website: 'Website',
    whatsapp: 'WhatsApp',
    x: 'X',
  }
  return names[channel]
}

export default function ChannelBadge({ identity }: ChannelBadgeProps) {
  const value = identity.username ? `@${identity.username}` : identity.sourceId

  return (
    <span
      className="inline-flex max-w-[12rem] items-center gap-1.5 truncate rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
      title={`${channelName(identity.channel)} ${identity.sourceId}`}
    >
      <span className={`text-[0.65rem] font-black ${colors[identity.channel]}`}>{labels[identity.channel]}</span>
      <span className="truncate">{value}</span>
    </span>
  )
}
