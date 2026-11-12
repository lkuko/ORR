const reportsApi = require('../../../services/reports')
const { dateTime, shortId } = require('../../../utils/format')
const typeLabels = { TASK: '任务', POST: '帖子', COMMENT: '评论', USER: '用户' }
const statuses = { OPEN: '待处理', RESOLVED: '已处理', DISMISSED: '不予处理' }

Page({
  data: { reports: [], loading: false, error: '', highlight: '' },
  onLoad(options) { this.setData({ highlight: options.highlight || '' }) },
  onShow() { return this.load() },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()) },
  load() {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, error: '' })
    return getApp().ensureLogin().then(() => reportsApi.mine()).then(reports => {
      if (requestId !== this.requestId) return
      this.setData({ loading: false, reports: reports.map(report => ({
        ...report, targetLabel: typeLabels[report.targetType] || '内容',
        targetNumber: shortId(report.targetId), statusLabel: statuses[report.status] || '处理中',
        createdLabel: dateTime(report.createdAt), handledLabel: dateTime(report.handledAt)
      })) })
    }).catch(error => {
      if (requestId === this.requestId) this.setData({ loading: false, error: error.message })
    })
  },
  goToForum() { wx.switchTab({ url: '/pages/forum/list/index' }) }
})
