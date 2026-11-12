const fs = require('node:fs')
const automator = require('miniprogram-automator')
const schema = require('../database/collections.json')
;(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  const outcomes = []
  const runId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2)
  let createdTaskId
  let taskCancelled = false
  async function call(action, data = {}, requestId) {
    const result = await mini.evaluate(async (action, data, requestId) => {
      const started = Date.now()
      try {
        const response = await wx.cloud.callFunction({ name: 'campus-api', data: { action, data, requestId } })
        return { ...response.result, totalMs: Date.now() - started }
      } catch(error) { return { ok: false, error: { code: 'TRANSPORT_ERROR', message: error.errMsg || error.message }, totalMs: Date.now() - started } }
    }, action, data, requestId || 'smoke_' + Date.now() + '_' + Math.random().toString(36).slice(2))
    outcomes.push({ action, ok: result.ok, error: result.error, totalMs: result.totalMs, meta: result.meta })
    return result
  }
  function requireOk(result) { if (!result.ok) throw new Error(result.error?.message || 'Cloud call failed'); return result.data }
  try {
    requireOk(await call('users.login'))
    requireOk(await call('tasks.list'))
    const key = 'smoke_create_' + runId
    const input = { title: '云开发验收任务', description: '仅供云开发链路验收，无需接单。', category: 'ERRAND', rewardAmount: '0.29', publicArea: '验收测试区域', exactLocation: '验收私密地点示例' }
    const task = requireOk(await call('tasks.create', input, key)).task
    createdTaskId = task.id
    const repeat = requireOk(await call('tasks.create', input, key)).task
    if (task.id !== repeat.id) throw new Error('Deduplication failed')
    const detail = requireOk(await call('tasks.get', { id: task.id })).task
    if (detail.exactLocation !== input.exactLocation) throw new Error('Owner private details missing')
    const list = requireOk(await call('tasks.list')).tasks
    if (list.some(item => item.exactLocation !== null)) throw new Error('Public list leaks precise location')
    const accept = await call('tasks.accept', { id: task.id })
    if (accept.error?.code !== 'CANNOT_ACCEPT_OWN_TASK') throw new Error('Own-task rejection failed')
    const admin = await call('admin.users', { role: 'ADMIN', uid: 'forged' })
    if (admin.error?.code !== 'ADMIN_REQUIRED') throw new Error('Admin authorization failed')
    requireOk(await call('tasks.cancel', { id: task.id }, 'smoke_cancel_' + runId))
    taskCancelled = true
    const denied = await mini.evaluate(async names => {
      const results = []
      for (const name of names) {
        try { await wx.cloud.database().collection(name).limit(1).get(); results.push({ name, denied: false }) }
        catch(error) { results.push({ name, denied: String(error.errMsg).includes('permission') || error.errCode === -502003, code: error.errCode }) }
      }
      try { await wx.cloud.database().collection('users').doc('security_probe').set({ data: { nickname: 'probe' } }); results.push({ name: 'users.write', denied: false }) }
      catch(error) { results.push({ name: 'users.write', denied: String(error.errMsg).includes('permission') || error.errCode === -502003, code: error.errCode }) }
      return results
    }, schema.collections.map(x => x.name))
    outcomes.push({ databaseDirectAccess: denied })
    if (denied.some(x => !x.denied)) throw new Error('Client database permission verification failed')
    console.log('Real cloud smoke passed: login, moderated task create, idempotency, privacy, cancellation, admin denial and direct database denial.')
  } finally {
    if (createdTaskId && !taskCancelled) {
      const cleanup = await call('tasks.cancel', { id: createdTaskId }, 'smoke_cancel_' + runId)
      if (!cleanup.ok) console.error('Smoke task could not be cancelled:', createdTaskId)
    }
    fs.mkdirSync('.local', { recursive: true })
    fs.writeFileSync('.local/cloud-smoke-results.json', JSON.stringify(outcomes, null, 2))
    console.log(JSON.stringify(outcomes))
    await mini.disconnect()
  }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
