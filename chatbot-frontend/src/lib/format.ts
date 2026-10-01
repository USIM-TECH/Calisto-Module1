/**
 * Human-readable intent / service value: `browse_eyewear` → "Browse Eyewear".
 * Only the first letter of each word is changed, so "Ray-Ban" stays intact.
 */
export function formatIntent(value: string): string {
  return value
    .replace(/^\//, '') // Rasa payloads look like `/find_a_store`
    .replace(/[_\s]+/g, ' ')
    .trim()
    .replace(/(^|\s)(\S)/g, (_match, space: string, letter: string) => space + letter.toUpperCase())
}
