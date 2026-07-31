import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim()
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex')
  }
  const buf = Buffer.from(trimmed, 'base64')
  if (buf.length !== 32) {
    throw new Error('CHANNEL_CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44-char base64)')
  }
  return buf
}

export function encryptCredentials(plaintext: string, encryptionKey: string): string {
  const key = parseKey(encryptionKey)
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptCredentials(ciphertext: string, encryptionKey: string): string {
  const key = parseKey(encryptionKey)
  const [ivHex, tagHex, dataHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted credentials format')
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

export function maskSecret(value: string | undefined, visible = 4): string | undefined {
  if (!value) return undefined
  if (value.length <= visible * 2) return '*'.repeat(value.length)
  return `${value.slice(0, visible)}…${value.slice(-visible)}`
}
