export const CACHE_KEYS = {
  productsCatalogue: 'products:catalogue:v1',
  presetActive: 'presets:active:v1',
  knowledgeChunks: 'knowledge:chunks:v1',
  knowledgeSummary: 'knowledge:summary:v1',
  knowledgeDocuments: 'knowledge:documents:v1',
  reportsLeads: 'reports:leads:v1',
  instagramToken: (accountId?: string) => (accountId ? `ig:access_token:${accountId}` : 'ig:access_token'),
  telegramCallbackPrefix: 'tg:cb:',
} as const

export function telegramCallbackKey(token: string): string {
  return `${CACHE_KEYS.telegramCallbackPrefix}${token}`
}

export function webchatRateLimitKey(key: string): string {
  return `ratelimit:webchat:${key}`
}
