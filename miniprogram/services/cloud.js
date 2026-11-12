const config = require('../utils/config')
let initialized = false, sequence = 0
function initialize() {
  if (initialized) return
  if (!config.cloudEnv) throw new Error('当前版本尚未配置云环境')
  if (!wx.cloud) throw new Error('请升级微信后重试')
  wx.cloud.init({ env: config.cloudEnv, traceUser: true })
  initialized = true
}
function requestId() {
  return 'r_' + Date.now().toString(36) + '_' + (++sequence).toString(36) + '_' + Math.random().toString(36).slice(2, 14)
}
function call(action, data = {}, options = {}) {
  return Promise.resolve().then(() => {
    initialize()
    const started = Date.now()
    return wx.cloud.callFunction({
      name: config.functionName, config: { env: config.cloudEnv },
      data: { action, data, requestId: options.requestId || requestId() }
    }).then(response => {
      const result = response.result
      if (!result || typeof result.ok !== 'boolean') throw new Error('服务响应异常，请稍后重试')
      if (!result.ok) {
        const error = new Error(result.error?.message || '操作失败，请稍后重试')
        error.code = result.error?.code
        throw error
      }
      // No identities, drafts or private locations in performance logs.
      if (config.envVersion === 'develop') console.info('[campus-api]', action, { totalMs: Date.now() - started, ...result.meta })
      return result.data
    }, () => {
      const error = new Error('网络连接失败，请稍后重试')
      error.code = 'TRANSPORT_ERROR'
      throw error
    })
  })
}
// Keep the ID for uncertain mutations including app restarts, never the payload.
function fingerprint(value) {
  const text = JSON.stringify(value)
  let one = 2166136261, two = 5381
  for (let i = 0; i < text.length; i++) {
    one = Math.imul(one ^ text.charCodeAt(i), 16777619)
    two = Math.imul(two, 33) ^ text.charCodeAt(i)
  }
  return text.length + '_' + (one >>> 0) + '_' + (two >>> 0)
}
function mutate(action, data = {}) {
  const userId = getApp().globalData.user?.id || 'pending'
  const key = ['orr:pending', config.cloudEnv, userId, action, fingerprint(data)].join(':')
  let id
  try {
    id = wx.getStorageSync(key) || requestId()
    wx.setStorageSync(key, id)
  } catch (_) { return Promise.reject(new Error('无法保存请求记录，请检查设备存储后重试')) }
  return call(action, data, { requestId: id }).then(result => {
    try { wx.removeStorageSync(key) } catch (_) {}
    return result
  }).catch(error => {
    if (error.code && !['TRANSPORT_ERROR', 'INTERNAL_ERROR', 'BUSY'].includes(error.code)) {
      try { wx.removeStorageSync(key) } catch (_) {}
    }
    throw error
  })
}
module.exports = { initialize, call, mutate }
