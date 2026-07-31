export function normalizeBrand(brand?: string): string | undefined {
  if (!brand) return undefined

  const lowered = brand.toLowerCase().trim()
  const canonicalMap: Record<string, string> = {
    'rayban': 'Ray-Ban',
    'ray ban': 'Ray-Ban',
    'ray-ban': 'Ray-Ban',
    'bausch lomb': 'Bausch & Lomb',
    'bausch and lomb': 'Bausch & Lomb',
    'bausch & lomb': 'Bausch & Lomb',
    'bossini': 'Bossini',
    'bottega veneta': 'Bottega Veneta',
    'acuvue': 'Acuvue',
    'gucci': 'Gucci',
  }

  return canonicalMap[lowered] || brand.trim()
}
