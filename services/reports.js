const config = require('../utils/config')
const { request } = require('./request')

function create(targetType, targetId, reason) {
  if (config.useDemoData) {
    const reports = wx.getStorageSync('demoReports') || []
    reports.push({ id: Date.now(), targetType, targetId, reason, status: 'OPEN' })
    wx.setStorageSync('demoReports', reports)
    return Promise.resolve({ status: 'OPEN' })
  }
  return request('/reports', { method: 'POST', data: { targetType, targetId, reason } })
}

module.exports = { create }
