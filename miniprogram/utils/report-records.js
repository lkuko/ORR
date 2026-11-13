const reportsApi = require('../services/reports')
const { dateTime, shortId } = require('./format')
const { confirmClear, clearBatches } = require('./record-cleanup')
const { chooseRetentionDays } = require('./trade-record')
const { confirm } = require('./dialog')
const typeLabels = { TASK: '任务', POST: '帖子', COMMENT: '评论', USER: '用户', PRODUCT: '商品' }
const statuses = { OPEN: '待处理', RESOLVED: '已处理', DISMISSED: '不予处理' }
const reportData = { reports: [], loading: false, error: '', highlight: '', swipeId: '', busyId: '', cleanupCount: 0 }
const reportMethods = {
  async loadReports() {
    if (this.busy) return
    const request = this.request = (this.request || 0) + 1
    this.setData({ loading: true, error: '', swipeId: '' })
    try {
      await getApp().ensureLogin()
      const reports = await reportsApi.mine({ view: this.data.trashOnly ? 'trash' : 'list' })
      if (request !== this.request) return
      this.setData({ loading: false, reports: reports.map(report => ({
        ...report, targetLabel: typeLabels[report.targetType] || '内容', targetNumber: shortId(report.targetId),
        statusLabel: statuses[report.status] || '处理中', createdLabel: dateTime(report.createdAt),
        handledLabel: dateTime(report.handledAt), expiresLabel: dateTime(report.archiveExpiresAt)
      })) })
    } catch (error) { if (request === this.request) this.setData({ loading: false, error: error.message }) }
  },
  reveal(event) { if (!this.busy) this.setData({ swipeId: event.detail.id }) },
  closeSwipe() { this.setData({ swipeId: '' }) },
  swiping() { this.suppressOpenUntil = Date.now() + 400 },
  removeReport(event) { return this.changeReports((event.detail && event.detail.id) || event.currentTarget.dataset.id, false) },
  removeAllReports() { return this.changeReports(undefined, false) },
  clearReport(event) { return this.changeReports((event.detail && event.detail.id) || event.currentTarget.dataset.id, true) },
  clearAllReports() { return this.changeReports(undefined, true) },
  async changeReports(id, permanent) {
    if (this.busy || this.suppressOpenUntil > Date.now() || permanent !== this.data.trashOnly) return
    if (id && !this.data.reports.some(report => report.id === id)) return
    this.busy = true; this.request = (this.request || 0) + 1
    this.setData({ busyId: id || 'all', swipeId: '', loading: false, cleanupCount: 0 })
    let completed = 0, attempted = false
    const progress = cleared => {
      completed += cleared.length
      this.setData({ cleanupCount: completed, reports: this.data.reports.filter(report => !cleared.includes(report.id)) })
    }
    try {
      let days = 0
      const scope = id ? '这条举报记录' : (permanent ? '举报回收站内的全部记录' : '全部举报记录（包含未显示的历史记录）')
      if (permanent) {
        if (!await confirmClear(id ? '清理这条记录？' : '清空举报回收站？', scope + '将从你的列表中永久移除，无法恢复。举报继续处理，管理员保留举报内容。')) return
      } else {
        days = await chooseRetentionDays()
        if (!days) return
        const decision = await confirm('移入回收站', scope + '将移入“我的 → 回收站 → 举报记录”，' + days + ' 天内可恢复。举报继续处理。')
        if (!decision.confirm) return
      }
      attempted = true
      const mutate = permanent ? reportsApi.clear : ids => reportsApi.archive(ids, days)
      if (id) await clearBatches([id], mutate, progress)
      else {
        const view = permanent ? 'trash' : 'list'
        let result = await reportsApi.minePage({ view })
        const before = result.snapshotAt, seen = new Set()
        if (!before) throw new Error('请稍后重试，服务正在更新')
        // Each successful batch leaves this query; older records are included.
        while (result.reports.length) {
          const ids = result.reports.map(report => report.id)
          if (ids.some(key => seen.has(key))) throw new Error('列表正在同步，请稍后重试')
          await clearBatches(ids, mutate, progress)
          ids.forEach(key => seen.add(key))
          result = await reportsApi.minePage({ view, before })
        }
      }
      wx.showToast({ title: completed ? (permanent ? '已清理 ' : '已移入回收站 ') + completed + ' 条' : '暂无需要处理的记录', icon: 'none' })
    } catch (error) { wx.showToast({ title: (completed ? '已处理 ' + completed + ' 条；' : '') + error.message, icon: 'none', duration: 3500 }) }
    finally { this.busy = false; this.setData({ busyId: '' }); if (attempted) await this.loadReports() }
  },
  async restoreReport(event) {
    if (this.busy || this.suppressOpenUntil > Date.now() || !this.data.trashOnly) return
    const id = event.currentTarget.dataset.id
    if (!this.data.reports.some(report => report.id === id && report.archived)) return
    this.busy = true; this.request = (this.request || 0) + 1
    this.setData({ busyId: id, loading: false, swipeId: '' })
    try {
      await reportsApi.restore(id)
      this.setData({ reports: this.data.reports.filter(report => report.id !== id) })
      wx.showToast({ title: '已恢复到我的举报', icon: 'none' })
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
    finally { this.busy = false; this.setData({ busyId: '' }); await this.loadReports() }
  },
  goToForum() { wx.switchTab({ url: '/pages/forum/list/index' }) }
}
module.exports = { reportData, reportMethods }
