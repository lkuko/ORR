const crypto = require('node:crypto')

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signToken(payload, secret, lifetimeSeconds = 60 * 60 * 24 * 7) {
  const now = Math.floor(Date.now() / 1000)
  const body = encode({ ...payload, iat: now, exp: now + lifetimeSeconds })
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

function verifyToken(token, secret) {
  const [body, signature, extra] = String(token || '').split('.')
  if (!body || !signature || extra) return null
  const expected = crypto.createHmac('sha256', secret).update(body).digest()
  let actual
  try {
    actual = Buffer.from(signature, 'base64url')
  } catch (_) {
    return null
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null
    if (!['user', 'admin'].includes(payload.role) || !/^[1-9]\d*$/.test(String(payload.sub))) return null
    return payload
  } catch (_) {
    return null
  }
}

module.exports = { signToken, verifyToken }
