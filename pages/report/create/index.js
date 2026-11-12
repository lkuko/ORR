const reportsApi = require('../../../services/reports')

Page({
  data: { targetType: '', targetId: '', reason: '', submitting: false },
  onLoad(options) { this.setData({ targetType: options.type || '', targetId: options.id || '' }) },
  onInput(event) { this.setData({ reason: event.detail.value }) },
  submit() {
    if (this.data.submitting) return
    const reason = this.data.reason.trim()
    if (reason.length < 2) {
      wx.showToast({ title: '请填写举报原因', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    getApp().ensureLogin().then(() => reportsApi.create(this.data.targetType, this.data.targetId, reason)).then(() => {
      wx.showToast({ title: '举报已提交', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 350)
    }).catch(error => {
      this.setData({ submitting: false })
      wx.showToast({ title: error.message, icon: 'none' })
    })
  }
})
