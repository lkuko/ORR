const reportsApi = require('../../../services/reports')

Page({
  data: { targetType: '', targetId: '', reason: '', submitting: false, submitted: false, reportId: '' },
  onLoad(options) { this.setData({ targetType: options.type || '', targetId: options.id || '' }) },
  onInput(event) { this.setData({ reason: event.detail.value }) },
  submit() {
    if (this.data.submitting || this.data.submitted) return
    const reason = this.data.reason.trim()
    if (reason.length < 2) {
      wx.showToast({ title: '请填写举报原因', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    return getApp().ensureLogin().then(() => reportsApi.create(this.data.targetType, this.data.targetId, reason)).then(report => {
      this.setData({ submitted: true, submitting: false, reportId: report.id })
      wx.showToast({ title: '举报已提交', icon: 'success' })
    }).catch(error => {
      this.setData({ submitting: false })
      wx.showToast({ title: error.message, icon: 'none' })
    })
  },
  openRecords() { wx.redirectTo({ url: '/pages/report/list/index?highlight=' + encodeURIComponent(this.data.reportId) }) },
  goBack() { wx.navigateBack() }
})
