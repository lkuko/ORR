const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createMiniProgram } = require('../helpers/miniprogram')
const { money, amount } = require('../../cloudfunctions/campus-api/lib/validation')
const { createContentGuard } = require('../../cloudfunctions/campus-api/lib/content-guard')
const { createStore, isConflict } = require('../../cloudfunctions/campus-api/lib/store')
const { AppError } = require('../../cloudfunctions/campus-api/lib/errors')
test('build configuration has no demo identity and unknown builds fail closed', async () => {
  for (const envVersion of ['develop', 'trial', 'release', 'unknown']) {
    const client = createMiniProgram({ envVersion })
    assert.equal('useDemoData' in client.config, false)
    assert.equal('useDemoLogin' in client.config, false)
    if (['release', 'unknown'].includes(envVersion)) await assert.rejects(client.app.ensureLogin(), /云环境/)
  }
})
test('login uses cloud identity without wx.login, HTTP or a client-supplied OpenID', async () => {
  const calls = []
  const client = createMiniProgram({ envVersion: 'trial', wxOverrides: {
    login() { throw new Error('Legacy login') }, request() { throw new Error('Legacy transport') },
    cloud: { init() {}, async callFunction(options) {
      calls.push(options)
      return { result: { ok: true, data: { user: { id: 'cloud-user', nickname: '同学' } } } }
    } }
  } })
  const [one, two] = await Promise.all([client.app.ensureLogin(), client.app.ensureLogin()])
  assert.equal(one.id, 'cloud-user'); assert.equal(two.id, 'cloud-user')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].data.action, 'users.login')
  assert.deepEqual(Object.keys(calls[0].data.data), [])
})
test('money is integer cents without floating arithmetic and rejects scientific notation or sub-cents', () => {
  for (const [value, cents] of [['0.29',29],['999999.99',99999999],['1.2',120],['0',0]]) {
    assert.equal(money(value), cents)
    assert.equal(money(amount(cents)), cents)
  }
  for (const value of ['1e2', '-1', '0.001', {}, '1000000', 'NaN']) assert.throws(() => money(value))
})
test('content security requires an explicit pass; unclear, review, reject and API errors fail closed', async () => {
  for (const response of [null, {}, { errCode: 0 }, { errCode: 0, result: { suggest: 'review' } }, { errCode: 0, result: { suggest: 'risky' } }]) {
    const guard = createContentGuard({ openapi: { security: { msgSecCheck: async () => response } } })
    await assert.rejects(guard('content', 'openid'))
  }
  const guard = createContentGuard({ openapi: { security: { msgSecCheck: async () => ({ errCode: 0, result: { suggest: 'pass' } }) } } })
  await guard('content', 'openid')
})
test('transaction adapter returns callback data, rolls back business errors and only retries write conflicts', async () => {
  let starts = 0, commits = 0, rollbacks = 0
  const db = { async startTransaction() { starts++; return {
    async commit() { commits++; if (commits === 1) throw { code: 'DATABASE_TRANSACTION_CONFLICT' } },
    async rollback() { rollbacks++ }
  } } }
  assert.deepEqual(await createStore(db).transact(async () => ({ id: 'committed' })), { id: 'committed' })
  assert.equal(starts, 2)
  await assert.rejects(createStore(db).transact(async () => { throw new AppError('FORBIDDEN', '禁止') }), { code: 'FORBIDDEN' })
  assert.equal(starts, 3); assert.equal(rollbacks, 2)
})
test('comment report keeps the actual string document ID', () => {
  const client = createMiniProgram()
  const page = client.page('./pages/forum/detail/index.js')
  page.reportComment({ currentTarget: { dataset: { id: 'comment-912' } } })
  assert.equal(client.navigation[0], '/pages/report/create/index?type=COMMENT&id=comment-912')
})

test('observed cloud transaction conflict is retryable; generic system errors are not', () => {
  assert.equal(isConflict({ errCode: -501001, errMsg: 'document.update:fail -501001 resource system error. [ResourceUnavailable.TransactionConflict] Transaction is conflict, maybe resource operated by others.' }), true)
  assert.equal(isConflict({ errCode: -501001, errMsg: 'resource system error' }), false)
  assert.equal(isConflict({ code: 'DATABASE_PERMISSION_DENIED' }), false)
})

test('transaction start conflicts retry and exhausted conflicts return BUSY', async () => {
  let starts = 0
  const db = { async startTransaction() {
    starts++
    throw { errCode: -501001, errMsg: '[ResourceUnavailable.TransactionConflict] Transaction is conflict' }
  } }
  await assert.rejects(createStore(db).transact(async () => {}), { code: 'BUSY' })
  assert.equal(starts, 7)
})
