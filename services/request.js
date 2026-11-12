const config = require('../utils/config')

function request(path, options = {}) {
  const app = getApp()
  if (config.apiBaseUrl.includes('example.com')) return Promise.reject(new Error('当前版本尚未配置服务地址'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${path}`,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'content-type': 'application/json',
        ...(app.globalData.token ? { Authorization: `Bearer ${app.globalData.token}` } : {}),
        ...(options.header || {})
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data)
          return
        }
        if (response.statusCode === 401 && path !== '/auth/wechat-login' && !options.retried) {
          app.globalData.user = null
          app.globalData.token = ''
          app.ensureLogin().then(() => request(path, { ...options, retried: true })).then(resolve, reject)
          return
        }
        reject(new Error(response.data?.error?.message || '请求失败，请稍后重试'))
      },
      fail() {
        reject(new Error('网络连接失败，请检查网络后重试'))
      }
    })
  })
}

module.exports = { request }
