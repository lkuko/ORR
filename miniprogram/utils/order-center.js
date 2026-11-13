const tasksApi = require('../services/tasks')
const market = require('../services/market')
const { taskHint } = require('./task-ui')
const { shortId } = require('./format')
const { chooseRetentionDays } = require('./trade-record')
const { confirm } = require('./dialog')
const { confirmClear, clearBatches } = require('./record-cleanup')
const { reportData, reportMethods } = require('./report-records')
const roleLabels = { buyer: '我买到的', seller: '我卖出的', owner: '我发布的', helper: '我接单的' }
function openOrderCenter(kind, role) {
  getApp().orderCenterIntent = { kind, role }
  wx.switchTab({ url: '/pages/orders/list/index' })
}
function createOrderCenter(defaultKind = 'market', trashOnly = false) {
  const initialRole = defaultKind === 'tasks' ? 'owner' : 'buyer'
  return {
    ...reportMethods,
    data: {
      ...reportData, trashOnly, kind: defaultKind, role: initialRole, roleLabel: roleLabels[initialRole],
      status: 'all', filter: 'all', view: trashOnly ? 'trash' : 'list',
      filters: [{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'ended', label: '已结束' }],
      tasks: [], orders: [], cursor: ''
    },
    onLoad(options = {}) {
      if (options.role || options.kind) this.applyIntent({ kind: options.kind || defaultKind, role: options.role })
      if (!trashOnly && options.view === 'trash') wx.redirectTo({ url: '/pages/order-trash/index?kind=' + this.data.kind + '&role=' + this.data.role })
    },
    onShow() {
      if (this.busy) return
      const app = getApp()
      if (!trashOnly) {
        const intent = app.orderCenterIntent || (app.profileOrderRole ? { kind: 'tasks', role: app.profileOrderRole } : null)
        app.orderCenterIntent = null; app.profileOrderRole = ''
        if (intent) this.applyIntent(intent)
      }
      return this.load()
    },
    applyIntent(intent) {
      const kind = intent.kind === 'tasks' ? 'tasks' : trashOnly && intent.kind === 'reports' ? 'reports' : 'market'
      const role = kind === 'tasks' ? (intent.role === 'helper' ? 'helper' : 'owner') : (intent.role === 'seller' ? 'seller' : 'buyer')
      this.setData({ kind, role, roleLabel: roleLabels[role], view: trashOnly ? 'trash' : 'list', status: 'all', filter: 'all',
        tasks: [], orders: [], reports: [], cursor: '', swipeId: '', error: '' })
    },
    onPullDownRefresh() { return Promise.resolve(this.load()).finally(() => wx.stopPullDownRefresh()) },
    onReachBottom() { if (this.data.kind === 'market') return this.load(true) },
    selectKind(event) {
      const kind = event.currentTarget.dataset.kind
      if (this.busy || kind === this.data.kind) return
      this.roles = { ...this.roles, [this.data.kind]: this.data.role }
      this.applyIntent({ kind, role: this.roles[kind] }); return this.load()
    },
    selectRole(event) {
      const role = event.currentTarget.dataset.role
      if (this.busy || role === this.data.role) return
      this.setData({ role, roleLabel: roleLabels[role], tasks: [], orders: [], cursor: '', swipeId: '' }); return this.load()
    },
    selectStatus(event) {
      if (this.busy || trashOnly) return
      const value = event.currentTarget.dataset.value
      this.setData({ status: value, filter: value, swipeId: '', tasks: [], orders: [], cursor: '' }); return this.load()
    },
    selectFilter(event) { return this.selectStatus(event) },
    async load(append = false) {
      if (this.busy) return
      if (this.data.kind === 'reports') return this.loadReports()
      append = append === true
      if (append && (this.data.kind !== 'market' || !this.data.cursor || this.data.loading)) return
      const request = this.request = (this.request || 0) + 1
      const { kind, role, status, view } = this.data
      const query = { role, status, view, cursor: append ? this.data.cursor : '' }
      this.setData({ loading: true, error: '', ...(append ? {} : { cursor: '', swipeId: '' }) })
      try {
        const user = await getApp().ensureLogin()
        if (request !== this.request) return
        if (kind === 'market') {
          const result = await market.orders(query)
          if (request !== this.request) return
          const rows = append ? [...this.data.orders, ...result.orders] : result.orders
          this.setData({ orders: [...new Map(rows.map(row => [row.id, row])).values()], cursor: result.nextCursor || '', loading: false })
        } else {
          const result = await tasksApi.minePage(query)
          if (request !== this.request) return
          const tasks = result.tasks.map(task => ({ ...task, orderNumber: shortId(task.id), nextHint: taskHint(task, user.id) }))
          this.setData({ tasks, loading: false })
        }
      } catch (error) { if (request === this.request) this.setData({ loading: false, error: error.message }) }
    },
    loadMore() { return this.load(true) },
    reveal(event) { if (!this.busy) this.setData({ swipeId: event.detail.id }) },
    closeSwipe() { this.setData({ swipeId: '' }) },
    swiping() { this.suppressOpenUntil = Date.now() + 400 },
    archive(event) { return this.changeOrderRecords(event.currentTarget.dataset.id, 'archive') },
    archiveAll() { return this.changeOrderRecords(undefined, 'archive') },
    restore(event) { return this.changeOrderRecords(event.currentTarget.dataset.id, 'restore') },
    clearOne(event) { return this.changeOrderRecords((event.detail && event.detail.id) || event.currentTarget.dataset.id, 'clear') },
    clearAll() { return this.changeOrderRecords(undefined, 'clear') },
    async changeOrderRecords(id, action) {
      if (this.busy || this.data.kind === 'reports' || this.suppressOpenUntil > Date.now()) return
      if ((action === 'archive') === trashOnly) return
      const { kind, role, roleLabel } = this.data, taskMode = kind === 'tasks', listKey = taskMode ? 'tasks' : 'orders'
      const row = id && this.data[listKey].find(item => item.id === id)
      if (id && (!row || (action === 'archive' ? !row.canArchive : !row.archived))) return
      this.busy = true; this.request = (this.request || 0) + 1
      this.setData({ busyId: id || 'all', loading: false, swipeId: '', cleanupCount: 0 })
      let attempted = false, completed = 0
      const progress = ids => {
        completed += ids.length
        this.setData({ cleanupCount: completed, [listKey]: this.data[listKey].filter(item => !ids.includes(item.id)) })
      }
      try {
        if (action === 'restore') {
          attempted = true
          if (taskMode) await tasksApi.restore(id)
          else await market.orderAction(id, 'restore')
          progress([id]); wx.showToast({ title: '已恢复记录', icon: 'success' }); return
        }
        let days = 0
        if (action === 'archive') {
          days = await chooseRetentionDays()
          if (!days) return
          const decision = await confirm(id ? '删除这条记录？' : '删除全部已结束订单？',
            (id ? '这条记录' : '“' + roleLabel + '”中全部已完成或已取消的订单（包含未加载记录）') + '将移入回收站，保留 ' + days + ' 天。进行中订单和另一方记录不受影响。')
          if (!decision.confirm) return
        } else if (!await confirmClear(id ? '清理这条记录？' : '清空当前回收站？',
          (id ? '这条记录' : '“' + roleLabel + '”回收站内的全部记录') + '将从你的列表中永久移除，无法恢复。另一方的记录不受影响。')) return
        attempted = true
        const mutate = taskMode
          ? (action === 'archive' ? ids => tasksApi.archive(ids, days) : tasksApi.clear)
          : (action === 'archive' ? ids => market.archiveOrders(ids, days) : market.clearOrders)
        if (id) await clearBatches([id], mutate, progress)
        else if (taskMode) {
          const query = { role, view: trashOnly ? 'trash' : 'list', status: trashOnly ? 'all' : 'ended' }
          let result = await tasksApi.minePage(query)
          const before = result.snapshotAt, seen = new Set()
          if (!before) throw new Error('服务正在更新，请稍后重试')
          while (result.tasks.length) {
            const ids = result.tasks.map(item => item.id)
            if (ids.some(key => seen.has(key))) throw new Error('列表正在同步，请稍后重试')
            await clearBatches(ids, mutate, progress)
            ids.forEach(key => seen.add(key))
            result = await tasksApi.minePage({ ...query, before })
          }
        } else {
          const ids = [], cursors = new Set(); let cursor = ''
          do {
            const result = await market.orders({ role, view: trashOnly ? 'trash' : 'list', status: trashOnly ? 'all' : 'ended', pageSize: 40, cursor })
            ids.push(...result.orders.map(item => item.id)); cursor = result.nextCursor || ''
            if (cursor && cursors.has(cursor)) throw new Error('列表发生变化，请刷新后重试')
            cursors.add(cursor)
          } while (cursor)
          await clearBatches(ids, mutate, progress)
        }
        wx.showToast({ title: completed ? (action === 'archive' ? '已移入回收站 ' : '已清理 ') + completed + ' 条' : '暂无可处理的记录', icon: 'none' })
      } catch (error) { wx.showToast({ title: (completed ? '已处理 ' + completed + ' 条；' : '') + error.message, icon: 'none', duration: 3500 }) }
      finally { this.busy = false; this.setData({ busyId: '' }); if (attempted) await this.load() }
    },
    open(event) {
      if (this.busy || this.suppressOpenUntil > Date.now()) return
      if (this.data.swipeId) { this.closeSwipe(); return }
      const route = this.data.kind === 'tasks' ? '/pages/tasks/detail/index?id=' : '/pages/product-orders/detail/index?id='
      wx.navigateTo({ url: route + event.currentTarget.dataset.id })
    },
    openTask(event) { return this.open(event) },
    openCreate() { wx.navigateTo({ url: '/pages/tasks/create/index' }) },
    discover() { wx.switchTab({ url: '/pages/products/list/index' }) },
    emptyAction() { if (this.data.role === 'owner') this.openCreate(); else wx.switchTab({ url: '/pages/tasks/list/index' }) }
  }
}
module.exports = { createOrderCenter, openOrderCenter }
