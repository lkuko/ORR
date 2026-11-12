const { test, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { env } = require('../../src/config/env')
const { checkText } = require('../../src/lib/content-guard')
const originalFetch = global.fetch
const original = { mode: env.contentCheckMode, appId: env.appId, appSecret: env.appSecret }
afterEach(() => { global.fetch = originalFetch; env.contentCheckMode = original.mode; env.appId = original.appId; env.appSecret = original.appSecret })

test('content moderation only permits explicit pass responses', async () => {
  env.contentCheckMode = 'wechat'; env.appId = 'test-app'; env.appSecret = 'test-secret'
  let suggest = 'pass'
  global.fetch = async url => ({ ok: true, json: async () => String(url).includes('stable_token') ? { access_token: 'test-token', expires_in: 7200 } : { errcode: 0, result: suggest ? { suggest } : undefined } })
  await checkText('普通校园内容', 'test-openid')
  for (suggest of ['risky', 'review', null]) await assert.rejects(checkText('待检查内容', 'test-openid'), error => error.code === 'CONTENT_REJECTED')
})
