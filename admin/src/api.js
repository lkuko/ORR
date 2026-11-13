import cloudbase from '@cloudbase/js-sdk'
const env = import.meta.env.VITE_CLOUDBASE_ENV
const app = cloudbase.init({ env, region: 'ap-shanghai' })
const auth = app.auth({ persistence: 'local' })

async function call(action, data = {}, write = false) {
  const storageKey = 'orr:admin:pending:' + action
  const fingerprint = JSON.stringify(data)
  let pending
  if (write) {
    try { pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch (_) {}
    if (!pending || pending.fingerprint !== fingerprint) {
      pending = { fingerprint, id: crypto.randomUUID() }
      sessionStorage.setItem(storageKey, JSON.stringify(pending))
    }
  }
  const response = await app.callFunction({ name: 'campus-api', data: { action, data, requestId: pending?.id || crypto.randomUUID() } })
  const result = response.result
  if (!result?.ok) {
    const error = new Error(result?.error?.message || '服务暂时不可用')
    error.code = result?.error?.code
    if (write && error.code && !['INTERNAL_ERROR', 'BUSY'].includes(error.code)) sessionStorage.removeItem(storageKey)
    throw error
  }
  if (write) sessionStorage.removeItem(storageKey)
  return result.data
}
export const api = {
  async login(username, password) {
    await auth.signIn({ username, password })
    try { return await call('admin.session') } catch (error) { await auth.signOut(); throw error }
  },
  async restore() { return await auth.getLoginState() ? call('admin.session') : null },
  logout: () => auth.signOut(),
  reports: status => call('admin.reports', { status }),
  content: (type, id) => call('admin.content', { type, id: String(id) }),
  resolveReport: (id, status, resolution) => call('admin.resolveReport', { id: String(id), status, resolution }, true),
  hide: (type, id, reason) => call('admin.hide', { type, id: String(id), reason }, true),
  cancellations: () => call('admin.cancellations'),
  resolveCancellation: (id, cancelled, reason) => call('admin.resolveCancellation', { id: String(id), cancelled, reason }, true),
  users: q => call('admin.users', { q }),
  setUserStatus: (id, status, reason) => call('admin.setUserStatus', { id: String(id), status, reason }, true),
  actions: () => call('admin.actions'),
  products: data => call('admin.products', data),
  productOrders: data => call('admin.productOrders', data),
  marketImages: productIds => call('admin.mediaUrls', { productIds }),
  hideProduct: (id, reason) => call('admin.hideProduct', { id, reason }, true),
  resolveProductOrder: (id, cancelled, reason) => call('admin.resolveProductOrder', { id, cancelled, reason }, true)
}
