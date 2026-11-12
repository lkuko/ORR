const { test } = require('node:test')
const assert = require('node:assert/strict')
const { signToken, verifyToken } = require('../../src/lib/tokens')
const { hashPassword, verifyPassword } = require('../../src/lib/passwords')
const secret = 'a-cryptographically-random-secret-for-this-test-only'

test('token rejects expired, forged and malformed identities', () => {
  const token = signToken({ sub: 1, role: 'user' }, secret)
  assert.equal(verifyToken(token, secret).sub, 1)
  assert.equal(verifyToken(token, 'other-secret'), null)
  assert.equal(verifyToken(signToken({ sub: 1, role: 'user' }, secret, -1), secret), null)
  assert.equal(verifyToken('garbage', secret), null)
  assert.equal(verifyToken(signToken({ sub: 'not-a-user', role: 'admin' }, secret), secret), null)
})

test('password hashes use distinct salts and reject wrong passwords', async () => {
  const first = await hashPassword('correct-long-password')
  const second = await hashPassword('correct-long-password')
  assert.notEqual(first, second)
  assert.equal(await verifyPassword('correct-long-password', first), true)
  assert.equal(await verifyPassword('wrong-password', first), false)
})
