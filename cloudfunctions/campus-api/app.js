const { AppError, check } = require('./lib/errors')
const { hash, canonical } = require('./lib/validation')
const { userView } = require('./lib/views')
const routes = {
  ...require('./modules/users'), ...require('./modules/tasks'), ...require('./modules/messages'),
  ...require('./modules/forum'), ...require('./modules/reports'), ...require('./modules/admin')
}
const ALLOWED_APP_ID = 'wxe8c489bc30b7340f'
function userId(identity) {
  check(identity.openid && identity.appid === ALLOWED_APP_ID, 'UNAUTHENTICATED', '请通过微信小程序登录')
  return hash('wechat', identity.appid, identity.openid)
}
function actorKey(identity, admin) {
  if (!admin) return userId(identity)
  check(identity.uid && !identity.anonymous, 'ADMIN_REQUIRED', '请先登录管理员账号')
  return hash('admin', identity.uid)
}
async function actor(store, id, admin) {
  const value = await store.get(admin ? 'admin_users' : 'users', id)
  check(value && value.status === 'ACTIVE' && (!admin || value.role === 'ADMIN'),
    admin ? 'ADMIN_REQUIRED' : 'ACCOUNT_UNAVAILABLE', admin ? '没有管理员权限或登录已失效' : '账号不可用，请联系管理员')
  return value
}
function timedStore(store, metrics) {
  const result = {}
  for (const method of ['get', 'put', 'list']) result[method] = async (...args) => {
    const started = Date.now()
    try { return await store[method](...args) } finally { metrics.databaseMs += Date.now() - started }
  }
  result.transact = work => store.transact(tx => work(timedStore(tx, metrics)))
  return result
}
function createHandler({ store: originalStore, checkText, clock = () => new Date(), logger = () => {} }) {
  let coldStart = true
  return async function handle(event, identity) {
    const started = Date.now(), cold = coldStart
    coldStart = false
    const metrics = { databaseMs: 0, contentCheckMs: 0 }
    const store = timedStore(originalStore, metrics)
    let action = ''
    try {
      check(event && typeof event === 'object' && !Array.isArray(event), 'INVALID_REQUEST', '请求格式不正确')
      action = event.action
      check(typeof action === 'string' && action.length < 80, 'INVALID_ACTION', '请求操作无效')
      const data = event.data || {}
      check(typeof data === 'object' && !Array.isArray(data) && JSON.stringify(data).length <= 16000, 'INVALID_REQUEST', '请求内容过长或格式错误')
      let result
      if (action === 'system.health') {
        const id = userId(identity)
        try {
          await store.get('users', id)
          result = { version: '2.0.0', runtime: process.version, userId: id, databaseReady: true }
        } catch (error) {
          result = { version: '2.0.0', runtime: process.version, userId: id, databaseReady: false, databaseCode: error.errCode || error.code || 'UNKNOWN' }
        }
      } else if (action === 'users.login') {
        const id = userId(identity)
        result = await store.transact(async tx => {
          let user = await tx.get('users', id)
          if (!user) {
            user = { id, openid: identity.openid, appid: identity.appid, nickname: '校园同学', status: 'ACTIVE',
              activeTaskIds: [], revision: 0, createdAt: clock().toISOString() }
            await tx.put('users', id, user)
          }
          check(user.status === 'ACTIVE', 'ACCOUNT_UNAVAILABLE', '账号不可用，请联系管理员')
          return { user: userView(user) }
        })
      } else {
        check(Object.hasOwn(routes, action), 'INVALID_ACTION', '请求操作无效')
        const route = routes[action]
        const id = actorKey(identity, route.admin)
        const currentActor = await actor(store, id, route.admin)
        const ctx = { store, actor: currentActor, admin: !!route.admin, now: clock().toISOString() }
        if (!route.write) result = await route.run(ctx, data)
        else {
          check(typeof event.requestId === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(event.requestId), 'INVALID_REQUEST_ID', '缺少有效的请求标识')
          const operationId = hash(route.admin ? 'admin' : 'user', id, event.requestId)
          const digest = hash(action, canonical(data))
          const replay = record => {
            check(record.digest === digest, 'IDEMPOTENCY_CONFLICT', '请求标识已用于其他内容，请重新操作')
            return record.result
          }
          const existing = await store.get('idempotency', operationId)
          if (existing) result = replay(existing)
          else {
            const prepared = route.prepare ? route.prepare(data) : data
            const content = route.content?.(prepared)
            if (content) {
              const contentStarted = Date.now()
              try { await checkText(content, identity.openid, route.scene || 2) }
              finally { metrics.contentCheckMs += Date.now() - contentStarted }
            }
            result = await store.transact(async tx => {
              const current = await actor(tx, id, route.admin)
              const record = await tx.get('idempotency', operationId)
              if (record) return replay(record)
              // Serialize all writes with blocking/revocation, not just a stale read.
              const touched = { ...current, revision: (current.revision || 0) + 1 }
              await tx.put(route.admin ? 'admin_users' : 'users', id, touched)
              const output = await route.run({ ...ctx, store: tx, actor: touched, operationId, now: clock().toISOString() }, prepared)
              await tx.put('idempotency', operationId, { actorId: id, action, digest, result: output, createdAt: clock().toISOString() })
              return output
            })
          }
        }
      }
      const meta = { coldStart: cold, serverMs: Date.now() - started, ...metrics }
      logger({ action, ok: true, ...meta })
      return { ok: true, data: result, meta }
    } catch (error) {
      const expected = error instanceof AppError
      const code = expected ? error.code : 'INTERNAL_ERROR'
      logger({ action: typeof action === 'string' ? action : '', ok: false, code, serverMs: Date.now() - started, ...metrics })
      return { ok: false, error: { code, message: expected ? error.message : '服务暂时不可用，请稍后重试' } }
    }
  }
}
module.exports = { createHandler, userId, actorKey, ALLOWED_APP_ID }
