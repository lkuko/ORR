const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHandler, actorKey } = require('../../cloudfunctions/campus-api/app')
const { createMemoryStore } = require('../helpers/memory-store')
const { AppError } = require('../../cloudfunctions/campus-api/lib/errors')
const { createMiniProgram } = require('../helpers/miniprogram')
const input = { title: '取一本书', description: '请帮忙带到东区', category: 'ERRAND', rewardAmount: '0.29', publicArea: '东区', exactLocation: '一栋 301 室' }
const TEST_APP_ID = 'wx' + '0'.repeat(16)
async function fixture(checkText = async () => {}) {
  const store = createMemoryStore()
  const handle = createHandler({ store, checkText, allowedAppId: TEST_APP_ID })
  const identities = { owner: { appid: TEST_APP_ID, openid: 'owner' }, helper: { appid: TEST_APP_ID, openid: 'helper' }, stranger: { appid: TEST_APP_ID, openid: 'stranger' }, admin: { uid: 'admin-uid' } }
  const users = {}
  let sequence = 0
  const call = (who, action, data = {}, requestId = 'request_' + (++sequence)) => handle({ action, data, requestId }, identities[who])
  for (const who of ['owner', 'helper', 'stranger']) users[who] = (await call(who, 'users.login')).data.user
  const adminId = actorKey(identities.admin, true)
  await store.put('admin_users', adminId, { id: adminId, uid: identities.admin.uid, username: 'operator', role: 'ADMIN', status: 'ACTIVE' })
  return { store, handle, identities, users, call, create: async () => (await call('owner', 'tasks.create', input)).data.task }
}
function ok(response) { assert.equal(response.ok, true, JSON.stringify(response)); return response.data }

test('trusted identity only, string IDs, no OpenID or privilege fields in user responses', async () => {
  const f = await fixture()
  const response = await f.handle({ action: 'users.login', data: { openid: 'owner', userId: f.users.owner.id, role: 'ADMIN' } }, {})
  assert.equal(response.error.code, 'UNAUTHENTICATED')
  assert.equal((await f.handle({ action: 'users.login' }, { appid: 'other-app', openid: 'owner' })).ok, false)
  assert.equal(typeof f.users.owner.id, 'string')
  assert.equal('openid' in f.users.owner, false)
  assert.equal((await f.call('owner', 'admin.users', { uid: 'admin-uid', role: 'ADMIN' })).error.code, 'ADMIN_REQUIRED')
})

test('public lists and strangers cannot obtain precise location or order messages', async () => {
  const f = await fixture(), task = await f.create()
  assert.equal(task.rewardAmount, '0.29')
  assert.equal((await f.store.get('tasks', task.id)).rewardCents, 29)
  assert.equal(ok(await f.call('owner', 'tasks.list')).tasks[0].exactLocation, null)
  const other = ok(await f.call('stranger', 'tasks.get', { id: task.id })).task
  assert.equal(other.exactLocation, null)
  assert.equal(other.cancelReason, null)
  assert.equal((await f.call('stranger', 'messages.list', { id: task.id })).error.code, 'FORBIDDEN')
  assert.equal(ok(await f.call('owner', 'tasks.get', { id: task.id })).task.exactLocation, input.exactLocation)
})

test('twelve concurrent accept attempts commit one helper and one event', async () => {
  const f = await fixture(), task = await f.create()
  const identities = Array.from({ length: 12 }, (_, i) => ({ appid: TEST_APP_ID, openid: 'racer' + i }))
  await Promise.all(identities.map(identity => f.handle({ action: 'users.login' }, identity)))
  const results = await Promise.all(identities.map((identity, i) => f.handle({ action: 'tasks.accept', data: { id: task.id }, requestId: 'accept_' + i + '_race' }, identity)))
  assert.equal(results.filter(x => x.ok).length, 1)
  assert.ok(results.filter(x => !x.ok).every(x => x.error.code === 'TASK_NOT_OPEN'))
  assert.equal((await f.store.list('task_events', { taskId: task.id })).filter(x => x.eventType === 'ACCEPTED').length, 1)
  assert.equal((await f.store.get('tasks', task.id)).helperId, results.find(x => x.ok).data.task.helperId)
})

test('idempotent creation, conflicting payload rejection and duplicate messages after closure', async () => {
  const f = await fixture()
  const first = ok(await f.call('owner', 'tasks.create', input, 'create_same_key')).task
  const second = ok(await f.call('owner', 'tasks.create', input, 'create_same_key')).task
  assert.equal(first.id, second.id)
  assert.equal((await f.call('owner', 'tasks.create', { ...input, title: '其他任务' }, 'create_same_key')).error.code, 'IDEMPOTENCY_CONFLICT')
  ok(await f.call('helper', 'tasks.accept', { id: first.id }))
  const results = await Promise.all(Array.from({ length: 8 }, () => f.call('helper', 'messages.send', { id: first.id, content: '已经取到书了' }, 'message_same_key')))
  assert.ok(results.every(x => x.ok))
  assert.equal(new Set(results.map(x => x.data.message.id)).size, 1)
  assert.equal((await f.store.list('task_messages', { taskId: first.id })).length, 1)
  ok(await f.call('helper', 'tasks.complete', { id: first.id }))
  assert.equal((await f.call('helper', 'tasks.confirm', { id: first.id })).error.code, 'FORBIDDEN')
  ok(await f.call('owner', 'tasks.confirm', { id: first.id }))
  assert.equal((await f.call('helper', 'messages.send', { id: first.id, content: '已经取到书了' }, 'message_same_key')).ok, true)
  assert.equal((await f.call('helper', 'messages.send', { id: first.id, content: '新留言' })).error.code, 'TASK_CLOSED')
})

test('cancellation approval, refusal, admin restore and audit preserve state machine', async () => {
  const f = await fixture(), task = await f.create()
  ok(await f.call('helper', 'tasks.accept', { id: task.id }))
  ok(await f.call('helper', 'tasks.complete', { id: task.id }))
  ok(await f.call('owner', 'tasks.cancel-request', { id: task.id, reason: '需要重新确认' }))
  assert.deepEqual(ok(await f.call('admin', 'admin.cancellations')).tasks, [])
  assert.equal((await f.call('admin', 'admin.resolveCancellation', { id: task.id, cancelled: false, reason: '提前介入' })).error.code, 'INVALID_TASK_STATE')
  assert.equal((await f.call('owner', 'tasks.cancel-confirm', { id: task.id, accepted: true })).error.code, 'FORBIDDEN')
  assert.equal(ok(await f.call('helper', 'tasks.cancel-confirm', { id: task.id, accepted: false })).task.status, 'CANCEL_DISPUTED')
  assert.equal(ok(await f.call('admin', 'admin.cancellations')).tasks.length, 1)
  assert.equal((await f.call('owner', 'admin.resolveCancellation', { id: task.id, cancelled: false, reason: '恢复任务' })).error.code, 'ADMIN_REQUIRED')
  assert.equal(ok(await f.call('admin', 'admin.resolveCancellation', { id: task.id, cancelled: false, reason: '双方协商恢复' })).status, 'COMPLETION_PENDING')
  ok(await f.call('helper', 'tasks.cancel-request', { id: task.id, reason: '现在无法完成' }))
  assert.equal(ok(await f.call('owner', 'tasks.cancel-confirm', { id: task.id, accepted: true })).task.status, 'CANCELLED')
  assert.equal((await f.store.list('admin_action_logs')).length, 1)
  assert.deepEqual((await f.store.get('users', f.users.owner.id)).activeTaskIds, [])
})

test('blocking atomically cancels open tasks and escalates assigned tasks; restoration requires active participants', async () => {
  const f = await fixture(), open = await f.create(), assigned = await f.create()
  ok(await f.call('helper', 'tasks.accept', { id: assigned.id }))
  ok(await f.call('admin', 'admin.setUserStatus', { id: f.users.owner.id, status: 'BLOCKED', reason: '测试违规处置' }))
  assert.equal((await f.store.get('tasks', open.id)).status, 'CANCELLED')
  assert.equal((await f.store.get('tasks', open.id)).visibility, 'HIDDEN')
  assert.equal((await f.store.get('tasks', assigned.id)).status, 'CANCEL_DISPUTED')
  assert.equal((await f.call('owner', 'users.login')).error.code, 'ACCOUNT_UNAVAILABLE')
  assert.equal((await f.call('helper', 'messages.send', { id: assigned.id, content: '测试消息' })).error.code, 'PARTICIPANT_BLOCKED')
  assert.equal((await f.call('admin', 'admin.resolveCancellation', { id: assigned.id, cancelled: false, reason: '暂时恢复' })).error.code, 'PARTICIPANT_BLOCKED')
  ok(await f.call('admin', 'admin.setUserStatus', { id: f.users.owner.id, status: 'ACTIVE', reason: '申诉通过恢复' }))
  assert.equal(ok(await f.call('admin', 'admin.resolveCancellation', { id: assigned.id, cancelled: false, reason: '恢复任务' })).status, 'ASSIGNED')
})

test('forum, reports, content hiding and audit are protected and consistent', async () => {
  const f = await fixture()
  const post = ok(await f.call('owner', 'forum.create', { content: '今天的校园活动' })).post
  const comment = ok(await f.call('helper', 'forum.comment', { postId: post.id, content: '一起参加' })).comment
  assert.equal(ok(await f.call('stranger', 'forum.get', { id: post.id })).post.commentCount, 1)
  const report = ok(await f.call('stranger', 'reports.create', { targetType: 'COMMENT', targetId: comment.id, reason: '举报测试内容' }))
  assert.equal((await f.call('owner', 'admin.hide', { type: 'COMMENT', id: comment.id, reason: '违规测试' })).ok, false)
  ok(await f.call('admin', 'admin.hide', { type: 'COMMENT', id: comment.id, reason: '核实违规内容' }))
  ok(await f.call('admin', 'admin.resolveReport', { id: report.id, status: 'RESOLVED', resolution: '评论已下架' }))
  const visible = ok(await f.call('helper', 'forum.get', { id: post.id }))
  assert.equal(visible.comments.length, 0)
  assert.equal(visible.post.commentCount, 0)
  assert.equal(ok(await f.call('admin', 'admin.actions')).actions.length, 2)
})

test('report history is scoped to the trusted reporter and preserves the comment and resolution after moderation', async () => {
  const f = await fixture()
  const post = ok(await f.call('owner', 'forum.create', { content: '举报记录测试帖子' })).post
  const comment = ok(await f.call('helper', 'forum.comment', { postId: post.id, content: '需要核实的评论' })).comment
  const payload = { targetType: 'COMMENT', targetId: comment.id, reason: '这条评论需要核实' }
  const report = ok(await f.call('stranger', 'reports.create', payload, 'report_history_key'))
  assert.equal(ok(await f.call('stranger', 'reports.create', payload, 'report_history_key')).id, report.id)
  assert.deepEqual(ok(await f.call('owner', 'reports.mine', { reporterId: f.users.stranger.id, userId: f.users.stranger.id })).reports, [])
  const before = ok(await f.call('stranger', 'reports.mine')).reports
  assert.equal(before.length, 1)
  assert.equal(before[0].targetSummary, comment.content)
  assert.equal(before[0].status, 'OPEN')
  assert.equal(before[0].resolution, null)
  ok(await f.call('admin', 'admin.hide', { type: 'COMMENT', id: comment.id, reason: '测试下架评论' }))
  ok(await f.call('admin', 'admin.resolveReport', { id: report.id, status: 'RESOLVED', resolution: '已核实，评论已下架' }))
  const after = ok(await f.call('stranger', 'reports.mine')).reports[0]
  assert.equal(after.targetSummary, comment.content)
  assert.equal(after.status, 'RESOLVED')
  assert.equal(after.resolution, '已核实，评论已下架')
  assert.ok(after.handledAt)
  for (const field of ['reporterId', 'reporterNickname', 'handledBy', '_id']) assert.equal(field in after, false)
})

test('old reports remain readable and new reports cannot reveal hidden comment content', async () => {
  const f = await fixture()
  const post = ok(await f.call('owner', 'forum.create', { content: '历史记录测试' })).post
  const comment = ok(await f.call('helper', 'forum.comment', { postId: post.id, content: '下架后不可重新读取的评论' })).comment
  await f.store.put('reports', 'legacy-report', { id: 'legacy-report', reporterId: f.users.stranger.id,
    targetType: 'COMMENT', targetId: comment.id, reason: '历史举报原因', status: 'DISMISSED',
    resolution: '未发现违规', createdAt: '2025-01-01T00:00:00.000Z', handledAt: '2025-01-02T00:00:00.000Z' })
  ok(await f.call('admin', 'admin.hide', { type: 'POST', id: post.id, reason: '测试帖子下架' }))
  ok(await f.call('stranger', 'reports.create', { targetType: 'COMMENT', targetId: comment.id, reason: '测试隐藏内容' }))
  const mine = ok(await f.call('stranger', 'reports.mine')).reports
  assert.equal(mine.length, 2)
  assert.equal(mine[0].status, 'OPEN')
  assert.equal(mine[0].targetSummary, '')
  assert.equal(mine[1].status, 'DISMISSED')
  assert.equal(mine[1].targetSummary, '')
  assert.equal(mine[1].resolution, '未发现违规')
})

test('content rejection and unavailable moderation never create public content or consume the mutation', async () => {
  let reject = false
  const f = await fixture(async () => { if (reject) throw new AppError('CONTENT_CHECK_UNAVAILABLE', '检查不可用') })
  reject = true
  assert.equal((await f.call('owner', 'tasks.create', input, 'moderation_retry')).error.code, 'CONTENT_CHECK_UNAVAILABLE')
  assert.equal((await f.store.list('tasks')).length, 0)
  assert.equal((await f.store.list('idempotency')).length, 0)
  reject = false
  ok(await f.call('owner', 'tasks.create', input, 'moderation_retry'))
})

test('transaction failure rolls back content, events and deduplication record', async () => {
  const f = await fixture()
  const base = f.store.transact
  f.store.transact = work => base(async tx => {
    const put = tx.put
    tx.put = async (collection, ...args) => {
      if (collection === 'task_events') throw new Error('Injected storage failure')
      return put(collection, ...args)
    }
    return work(tx)
  })
  assert.equal((await f.call('owner', 'tasks.create', input)).error.code, 'INTERNAL_ERROR')
  assert.equal((await f.store.list('tasks')).length, 0)
  assert.deepEqual((await f.store.get('users', f.users.owner.id)).activeTaskIds, [])
})

test('actual client services through simulated cloud: lost response and restart reuse the persisted request ID', async () => {
  const f = await fixture(), task = await f.create()
  ok(await f.call('helper', 'tasks.accept', { id: task.id }))
  const storage = new Map()
  let loseResponse = true
  const ids = []
  const wxOverrides = { cloud: {
    init() {},
    async callFunction({ data }) {
      ids.push(data.requestId)
      const result = await f.handle(data, f.identities.helper)
      if (loseResponse) { loseResponse = false; throw new Error('Timeout after commit') }
      return { result }
    }
  } }
  const first = createMiniProgram({ storage, wxOverrides })
  first.app.globalData.user = f.users.helper
  await assert.rejects(first.tasks.sendMessage(task.id, '网络重试测试'))
  const restarted = createMiniProgram({ storage, wxOverrides })
  restarted.app.globalData.user = f.users.helper
  const message = await restarted.tasks.sendMessage(task.id, '网络重试测试')
  assert.equal(ids[0], ids[1])
  assert.equal(message.content, '网络重试测试')
  assert.equal((await f.store.list('task_messages', { taskId: task.id })).length, 1)
  assert.equal(storage.size, 0)
})
