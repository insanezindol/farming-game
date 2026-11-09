import { createHmac, randomBytes } from 'node:crypto'

export function accountId(input) {
  const id = typeof input === 'string' ? input.trim().toLowerCase() : ''
  return /^[a-z0-9_]{3,24}$/.test(id) ? id : null
}

export function validPassword(password) {
  return typeof password === 'string' && [...password].length >= 8 && Buffer.byteLength(password) <= 72
}

export function internalEmail(id, pepper) {
  const alias = createHmac('sha256', pepper).update('account:' + id).digest('hex').slice(0, 48)
  return alias + '@players.farm.invalid'
}

export function newRecoveryCode() {
  return randomBytes(24).toString('base64url')
}

export function recoveryDigest(id, code, pepper) {
  return createHmac('sha256', pepper).update('recovery:' + id + ':' + code).digest('hex')
}
