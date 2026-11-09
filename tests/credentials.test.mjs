import assert from 'node:assert/strict'
import test from 'node:test'
import { accountId, internalEmail, validPassword, newRecoveryCode, recoveryDigest } from '../lib/credentials.mjs'

const pepper = 'a'.repeat(64)

test('the same username maps to one account regardless of case or surrounding spaces', () => {
  assert.equal(accountId('  Farmer_01 '), 'farmer_01')
  assert.equal(internalEmail('farmer_01', pepper), internalEmail(accountId('FARMER_01'), pepper))
  assert.match(internalEmail('farmer_01', pepper), /^[a-f0-9]{48}@players\.farm\.invalid$/)
  assert.notEqual(internalEmail('farmer_02', pepper), internalEmail('farmer_01', pepper))
  assert.equal(accountId('user@example.com'), null)
  assert.equal(accountId('a'.repeat(25)), null)
})

test('password length is checked in UTF-8 bytes and recovery codes are unpredictable', () => {
  assert.equal(validPassword('12345678'), true)
  assert.equal(validPassword('short'), false)
  assert.equal(validPassword('가'.repeat(25)), false)
  const code = newRecoveryCode()
  assert.match(code, /^[A-Za-z0-9_-]{32}$/)
  assert.notEqual(code, newRecoveryCode())
  assert.equal(recoveryDigest('farmer_01', code, pepper), recoveryDigest('farmer_01', code, pepper))
  assert.notEqual(recoveryDigest('farmer_02', code, pepper), recoveryDigest('farmer_01', code, pepper))
})
