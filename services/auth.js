const config = require('../utils/config')
const { request } = require('./request')

function login() {
  if (config.useDemoData) {
    const user = wx.getStorageSync('demoUser') || { id: 'demo-user', nickname: '校园同学' }
    wx.setStorageSync('demoUser', user)
    return Promise.resolve({ user, token: 'demo-local-token' })
  }
  if (config.useDemoLogin) {
    const account = wx.getStorageSync('developmentAccount') === 'two' ? 'two' : 'one'
    return request('/auth/wechat-login', { method: 'POST', data: { code: `demo:campus-${account}` } })
  }
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (!result.code) {
          reject(new Error('微信登录凭证获取失败'))
          return
        }
        request('/auth/wechat-login', { method: 'POST', data: { code: result.code } })
          .then(response => resolve({ user: response.user, token: response.token }))
          .catch(reject)
      },
      fail() {
        reject(new Error('微信登录失败'))
      }
    })
  })
}

function updateNickname(nickname) {
  if (config.useDemoData) {
    const user = { ...(wx.getStorageSync('demoUser') || {}), nickname }
    wx.setStorageSync('demoUser', user)
    return Promise.resolve({ user })
  }
  return request('/auth/profile', { method: 'PATCH', data: { nickname } })
}

module.exports = { login, updateNickname }
