import * as crypto from 'crypto'
import { promisify } from 'util'

// scrypt password hashing (Node built-in, no native dependency).
// Stored format: scrypt$N$r$p$<salt base64>$<hash base64>

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>

const COST = 2 ** 15
const BLOCK_SIZE = 8
const PARALLELISM = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16
// 128 * N * r bytes, plus headroom.
const MAX_MEMORY = 128 * COST * BLOCK_SIZE * 2

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 256

export function validatePasswordStrength(password: string): string | undefined {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`
  }
  return undefined
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const hash = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAX_MEMORY,
  })
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64'), hash.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false
  }

  const [, n, r, p, saltB64, hashB64] = parts
  const N = Number(n)
  const blockSize = Number(r)
  const parallelism = Number(p)
  if (!Number.isInteger(N) || !Number.isInteger(blockSize) || !Number.isInteger(parallelism)) {
    return false
  }

  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N,
    r: blockSize,
    p: parallelism,
    maxmem: 128 * N * blockSize * 2,
  })
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

let dummyHash: Promise<string> | undefined

/**
 * Burn the same CPU time as a real check when the email is unknown, so response
 * timing does not reveal which emails have accounts.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'))
  await verifyPassword(password, await dummyHash)
  return false
}
