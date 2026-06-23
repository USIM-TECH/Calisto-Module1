import type { ChannelIdentityRecord, CustomerRecord } from '../types'

function csvCell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function customerDisplayName(customer: CustomerRecord): string {
  return customer.leadName ?? customer.email ?? customer.phone ?? 'Unknown Customer'
}

function formatIdentities(identities: ChannelIdentityRecord[]): { channels: string; handles: string } {
  if (identities.length === 0) return { channels: '', handles: '' }

  const channels = [...new Set(identities.map((identity) => identity.channel))].join('; ')
  const handles = identities
    .map((identity) => {
      const handle = identity.username ? `@${identity.username}` : identity.sourceId
      return `${identity.channel}:${handle}`
    })
    .join('; ')

  return { channels, handles }
}

export function downloadLeadsCsv(
  customers: CustomerRecord[],
  identitiesByCustomer: Map<string, ChannelIdentityRecord[]>,
): void {
  const headers = [
    'customer_id',
    'name',
    'email',
    'phone',
    'location',
    'qualification_status',
    'crm_status',
    'crm_record_id',
    'last_intent',
    'preferred_service',
    'channels',
    'channel_identities',
    'first_seen_at',
    'last_message_at',
    'updated_at',
  ]

  const sorted = customers
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const rows = sorted.map((customer) => {
    const identities = identitiesByCustomer.get(customer.id) ?? []
    const { channels, handles } = formatIdentities(identities)

    return [
      customer.id,
      customerDisplayName(customer),
      customer.email ?? '',
      customer.phone ?? '',
      customer.location ?? '',
      customer.qualificationStatus,
      customer.crmStatus,
      customer.crmRecordId ?? '',
      customer.lastIntent ?? '',
      customer.preferredService ?? '',
      channels,
      handles,
      customer.firstSeenAt,
      customer.lastMessageAt,
      customer.updatedAt,
    ]
  })

  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `calisto-leads-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
