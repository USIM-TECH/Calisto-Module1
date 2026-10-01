import { createRequire } from 'module'
import { parsePhoneNumber } from 'awesome-phonenumber'
import type { IncomingMessage } from '../types.js'

type GeoipLookup = typeof import('geoip-lite')['lookup']

const require = createRequire(import.meta.url)
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

// geoip-lite loads its whole database (~150 MB) into memory on require, so
// defer that until a website visitor actually needs a lookup.
let geoipLookup: GeoipLookup | null | undefined

function getGeoipLookup(): GeoipLookup | null {
  if (geoipLookup !== undefined) return geoipLookup
  try {
    geoipLookup = (require('geoip-lite') as typeof import('geoip-lite')).lookup
  } catch {
    geoipLookup = null
  }
  return geoipLookup
}

export function countryName(isoCode: string | undefined): string | undefined {
  if (!isoCode) return undefined
  try {
    return regionNames.of(isoCode.toUpperCase()) ?? undefined
  } catch {
    return undefined
  }
}

/** Approximate "City, Country" for a visitor IP. Private/unknown IPs return undefined. */
export function locationFromIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined
  const lookup = getGeoipLookup()
  if (!lookup) return undefined
  const result = lookup(ip.replace(/^::ffff:/, ''))
  if (!result?.country) return undefined
  const country = countryName(result.country) ?? result.country
  return result.city ? `${result.city}, ${country}` : country
}

/** Country from an international phone number without the leading "+", e.g. "60194009974" → "Malaysia". */
export function locationFromPhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, '')
  if (!digits) return undefined
  const parsed = parsePhoneNumber(`+${digits}`)
  return countryName(parsed.regionCode)
}

/** Readable text for a location pin the user shared; falls back to coordinates. */
export function formatSharedLocation(location: IncomingMessage['location']): string | undefined {
  if (!location) return undefined
  const label = [location.name, location.address]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ')
  if (label) return label
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return undefined
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
}
