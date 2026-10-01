import type { ChannelIdentityRecord } from '../types'

/**
 * Short, human-readable label for a channel identity. Website identities are
 * long generated session ids (e.g. `website-chatbot-<uuid>`), so they are shown
 * as "Website visitor · 65fd"; the full id stays available for tooltips/search.
 */
export function identityLabel(identity: Pick<ChannelIdentityRecord, 'channel' | 'sourceId' | 'username' | 'senderName'>): string {
  if (identity.username) return `@${identity.username}`
  if (identity.channel !== 'website') return identity.sourceId

  const suffix = identity.sourceId.replace(/[^a-z0-9]/gi, '').slice(-4)
  if (identity.senderName) return identity.senderName
  const kind = identity.sourceId.startsWith('website-admin-') ? 'Admin test' : 'Website visitor'
  return suffix ? `${kind} · ${suffix}` : kind
}
