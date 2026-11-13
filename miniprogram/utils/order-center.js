const tasksApi = require('../services/tasks')
const market = require('../services/market')
const { taskHint, filterOrders } = require('./task-ui')
const { shortId } = require('./format')
const { archiveOrder } = require('./trade-record')
const { confirmClear, clearBatches } = require('./record-cleanup')
const { reportData, reportMethods } = require('./report-records')

function openOrderCenter(kind, role) {
  getApp().orderCenterIntent = { kind, role }
  wx.switchTab({ url: '/pages/orders/list/index' })
}
function createOrderCenter(defaultKind = 'market', trashOnly = false) {
  return {
    ...reportMethods,
    data: {
      ...reportData,
      trashOnly, kind: defaultKind, role: defaultKind === 'market' ? 'buyer' : 'owner',
      status: 'all', filter: 'all', view: trashOnly ? 'trash' : 'list',
      filters: [{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'ended', label: '已结束' }],
      tasks: [], orders: [], loading: false, cursor: '', error: '', busyId: '', swipeId: '', cleanupCount: 0
    },
    onLoad(options = {}) {
      if (options.role) this.applyIntent({ kind: defaultKind, role: options.role })
      if (!trashOnly && options.view === 'trash') wx.redirectTo({ url: '/pages/order-trash/index?role=' + this.data.role })
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
      const kind = trashOnly ? (intent.kind === 'reports' ? 'reports' : 'market') : (intent.kind === 'tasks' ? 'tasks' : 'market')
      const role = kind === 'market' ? (intent.role === 'seller' ? 'seller' : 'buyer') : (intent.role === 'helper' ? 'helper' : 'owner')
      this.loadedTasks = []
      this.setData({ kind, role, view: trashOnly ? 'trash' : 'list', status: 'all', filter: 'all', tasks: [], orders: [], reports: [], cursor: '', swipeId: '', error: '' })
    },
    onPullDownRefresh() { return Promise.resolve(this.load()).finally(() => wx.stopPullDownRefresh()) },
    onReachBottom() { if (this.data.kind === 'market') return this.load(true) },
    selectKind(event) {
      const kind = event.currentTarget.dataset.kind
      if (this.busy || kind === this.data.kind) return
      this.roles = { ...this.roles, [this.data.kind]: this.data.role }
      this.applyIntent({ kind, role: this.roles[kind] })
      return this.load()
    },
    selectRole(event) {
      const role = event.currentTarget.dataset.role
      if (this.busy || role === this.data.role) return
      this.loadedTasks = []
      this.setData({ role, tasks: [], orders: [], cursor: '', swipeId: '' })
      return this.load()
    },
    selectStatus(event) {
      if (this.busy || trashOnly) return
      const value = event.currentTarget.dataset.value
      this.setData({ status: value, filter: value, swipeId: '' })
      if (this.data.kind === 'tasks') this.applyFilter()
      else { this.setData({ orders: [], cursor: '' }); return this.load() }
    },
    selectFilter(event) { return this.selectStatus(event) },
    applyFilter() { this.setData({ tasks: filterOrders(this.loadedTasks || [], this.data.filter) }) },
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
          const tasks = await tasksApi.listMine(role)
          if (request !== this.request) return
          this.loadedTasks = tasks.map(task => ({ ...task, orderNumber: shortId(task.id), nextHint: taskHint(task, user.id) }))
          this.setData({ loading: false }); this.applyFilter()
        }
      } catch (error) { if (request === this.request) this.setData({ loading: false, error: error.message }) }
    },
    loadMore() { return this.load(true) },
    reveal(event) { if (!this.busy) this.setData({ swipeId: event.detail.id }) },
    closeSwipe() { this.setData({ swipeId: '' }) },
    swiping() { this.suppressOpenUntil = Date.now() + 400 },
    archive(event) { return this.changeRecord(event.currentTarget.dataset.id, false) },
    restore(event) { return this.changeRecord(event.currentTarget.dataset.id, true) },
    async changeRecord(id, restore) {
      if (this.busy || this.suppressOpenUntil > Date.now()) return
      const item = this.data.orders.find(order => order.id === id)
      if (!item || (restore ? !item.archived : !item.canArchive)) return
      this.busy = true; this.request = (this.request || 0) + 1
      this.setData({ busyId: id, loading: false, swipeId: '' })
      try {
        const order = restore ? await market.orderAction(id, 'restore') : await archiveOrder(id)
        if (!order) return
        this.setData({ orders: this.data.orders.filter(row => row.id !== id) })
        wx.showToast({ title: restore ? '已恢复记录' : '已移入回收站', icon: 'success' })
      } catch (error) { wx.showToast({ title: error.message, icon: 'none' }) }
      finally { this.busy = false; this.setData({ busyId: '' }); if (!this.data.orders.length) await this.load() }
    },
    clearOne(event) { return this.clearRecords((event.detail && event.detail.id) || event.currentTarget.dataset.id) },
    clearAll() { return this.clearRecords() },
    async clearRecords(id) {
      if (this.busy || !trashOnly || this.suppressOpenUntil > Date.now()) return
      if (id && !this.data.orders.some(row => row.id === id && row.archived)) return
      const role = this.data.role, roleLabel = role === 'buyer' ? '我买到的' : '我卖出的'
      this.busy = true; this.request = (this.request || 0) + 1
      this.setData({ busyId: id || 'all', swipeId: '', loading: false, cleanupCount: 0 })
      let completed = 0, attempted = false
      try {
        if (!await confirmClear(id ? '清理这条记录？' : '清空当前回收站？',
          (id ? '这条记录' : '“' + roleLabel + '”回收站内的全部记录') + '将从你的列表中永久移除，无法恢复。另一方的记录不受影响。')) return
        attempted = true
        const ids = id ? [id] : []
        if (!id) {
          let cursor = ''; const cursors = new Set()
          do {
            const result = await market.orders({ role, view: 'trash', status: 'all', pageSize: 40, cursor })
            ids.push(...result.orders.map(row => row.id))
            cursor = result.nextCursor || ''
            if (cursor && cursors.has(cursor)) throw new Error('列表发生变化，请刷新后重试')
            cursors.add(cursor)
          } while (cursor)
        }
        await clearBatches(ids, market.clearOrders, cleared => {
          completed += cleared.length
          this.setData({ cleanupCount: completed, orders: this.data.orders.filter(row => !cleared.includes(row.id)) })
        })
        wx.showToast({ title: completed ? '已清理 ' + completed + ' 条记录' : '回收站已为空', icon: 'none' })
      } catch (error) { wx.showToast({ title: (completed ? '已清理 ' + completed + ' 条；' : '') + error.message, icon: 'none', duration: 3500 }) }
      finally { this.busy = false; this.setData({ busyId: '' }); if (attempted) await this.load() }
    },
    open(event) {
      if (this.busy || this.suppressOpenUntil > Date.now()) return
      if (this.data.swipeId) { this.closeSwipe(); return }
      wx.navigateTo({ url: '/pages/product-orders/detail/index?id=' + event.currentTarget.dataset.id })
    },
    openTask(event) { if (!this.busy) wx.navigateTo({ url: '/pages/tasks/detail/index?id=' + event.currentTarget.dataset.id }) },
    openCreate() { wx.navigateTo({ url: '/pages/tasks/create/index' }) },
    discover() { wx.switchTab({ url: '/pages/products/list/index' }) },
    emptyAction() { if (this.data.role === 'owner') this.openCreate(); else wx.switchTab({ url: '/pages/tasks/list/index' }) }
  }
}
module.exports = { createOrderCenter, openOrderCenter }
