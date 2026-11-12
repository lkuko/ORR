const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { assertProductionConfig, readDatabasePassword } = require('../../src/config/env')

function production(overrides = {}) {
  return {
    nodeEnv: 'production', tokenSecret: 'test-only-random-token-with-more-than-thirty-two-characters',
    appId: 'test-app', appSecret: 'test-secret', database: { password: 'test-db-password' },
    wechatLoginMode: 'wechat', contentCheckMode: 'wechat',
    webOrigin: 'https://admin.test.invalid', allowLoopbackHttp: false,
    ...overrides
  }
}

test('production defaults to HTTPS; loopback HTTP requires an explicit opt-in', () => {
  assert.doesNotThrow(() => assertProductionConfig(production()))
  assert.throws(() => assertProductionConfig(production({ webOrigin: 'http://127.0.0.1:18080' })), /HTTPS/)
  assert.doesNotThrow(() => assertProductionConfig(production({ webOrigin: 'http://127.0.0.1:18080', allowLoopbackHttp: true })))
})

test('internal opt-in cannot allow LAN or public HTTP origins or malformed origins', () => {
  for (const webOrigin of [
    'http://139.224.111.140:18080', 'http://10.100.167.235:18080', 'http://0.0.0.0:18080',
    'http://localhost:18080', 'http://127.0.0.1.evil.invalid:18080', 'http://127.0.0.1:18080/path',
    'http://user@127.0.0.1:18080', 'http://127.0.0.1:18080?x=1', 'https://admin.test.invalid/path', '*'
  ]) {
    assert.throws(() => assertProductionConfig(production({ webOrigin, allowLoopbackHttp: true })))
  }
})

test('internal opt-in retains real WeChat and strong credential requirements', () => {
  const internal = { webOrigin: 'http://127.0.0.1:18080', allowLoopbackHttp: true }
  for (const overrides of [{ wechatLoginMode: 'demo' }, { contentCheckMode: 'off' }, { tokenSecret: 'short' }, { appSecret: '' }, { database: { password: '' } }]) {
    assert.throws(() => assertProductionConfig(production({ ...internal, ...overrides })))
  }
})

test('database password file takes precedence and missing files fail closed', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-config-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'password')
  fs.writeFileSync(file, 'test-file-secret\n')
  assert.equal(readDatabasePassword({ DB_PASSWORD_FILE: file, DB_PASSWORD: 'old-value' }), 'test-file-secret')
  assert.equal(readDatabasePassword({ DB_PASSWORD: 'test-env-secret' }), 'test-env-secret')
  assert.throws(() => readDatabasePassword({ DB_PASSWORD_FILE: path.join(dir, 'missing'), DB_PASSWORD: 'fallback' }), /ENOENT/)
})
