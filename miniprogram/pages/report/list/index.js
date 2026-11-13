const { reportData, reportMethods } = require('../../../utils/report-records')
Page({
  ...reportMethods,
  data: { ...reportData, trashOnly: false },
  onLoad(options) { this.setData({ highlight: options.highlight || '' }) },
  onShow() { return this.loadReports() },
  load() { return this.loadReports() },
  onPullDownRefresh() { return Promise.resolve(this.loadReports()).finally(() => wx.stopPullDownRefresh()) }
})
