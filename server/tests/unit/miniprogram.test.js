const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createMiniProgram } = require('../helpers/miniprogram')

test('trial/release builds and unknown environments never enable local test identities', () => {
  for (const envVersion of ['trial', 'release', 'unknown']) {
    const client = createMiniProgram({ envVersion })
    assert.equal(client.config.useDemoData, false)
    assert.equal(client.config.useDemoLogin, false)
  }
  const unavailable = createMiniProgram({ wxOverrides: { getAccountInfoSync() { throw new Error('unavailable') } } })
  assert.equal(unavailable.config.envVersion, 'release')
  assert.equal(unavailable.config.useDemoLogin, false)
})

test('release login obtains a WeChat code instead of sending a test identity', async () => {
  let loginCalls = 0, submittedCode
  const client = createMiniProgram({
    envVersion: 'release', apiBaseUrl: 'https://api.test.invalid/api/v1',
    wxOverrides: {
      login(options) { loginCalls++; options.success({ code: 'wechat-code-for-test' }) },
      request(options) { submittedCode = options.data.code; options.success({ statusCode: 200, data: { token: 'test-token', user: { id: 42, nickname: '同学' } } }) }
    }
  })
  const user = await client.app.ensureLogin()
  assert.equal(user.id, 42)
  assert.equal(loginCalls, 1)
  assert.equal(submittedCode, 'wechat-code-for-test')
})

test('comment report action preserves the actual comment identity', () => {
  const client = createMiniProgram()
  const page = client.page('./pages/forum/detail/index.js')
  page.reportComment({ currentTarget: { dataset: { id: 912 } } })
  assert.equal(client.navigation[0], '/pages/report/create/index?type=COMMENT&id=912')
})
