const tasksApi = require('../../../services/tasks')
const { taskHint, filterOrders } = require('../../../utils/task-ui')
const { shortId } = require('../../../utils/format')

Page({
  data: { role: 'owner', filter: 'all', filters: [{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'ended', label: '已结束' }], tasks: [], loading: false, error: '' },
  onShow() {
    const role = getApp().profileOrderRole
    if (role) {
      if (role !== this.data.role) {
        this.loadedTasks = []
        this.setData({ role, tasks: [] })
      }
      getApp().profileOrderRole = ''
    }
    this.load()
  },
  load() {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, error: '' })
    return getApp().ensureLogin().then(user => { this.userId = user.id; return tasksApi.listMine(this.data.role) })
      .then(tasks => { if (this.requestId !== requestId) return; this.loadedTasks = tasks.map(task => ({ ...task, orderNumber: shortId(task.id), nextHint: taskHint(task, this.userId) })); this.setData({ loading: false }); this.applyFilter() })
      .catch(error => { if (this.requestId === requestId) this.setData({ error: error.message, loading: false }) })
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  selectFilter(event) { this.setData({ filter: event.currentTarget.dataset.value }); this.applyFilter() },
  applyFilter() { this.setData({ tasks: filterOrders(this.loadedTasks || [], this.data.filter) }) },
  emptyAction() { if (this.data.role === 'owner') this.openCreate(); else wx.switchTab({ url: '/pages/tasks/list/index' }) },
  selectRole(event) {
    const role = event.currentTarget.dataset.role
    if (role === this.data.role) return
    this.loadedTasks = []
    this.setData({ role, tasks: [] }, () => this.load())
  },
  openTask(event) {
    wx.navigateTo({ url: `/pages/tasks/detail/index?id=${event.currentTarget.dataset.id}` })
  },
  openCreate() { wx.navigateTo({ url: '/pages/tasks/create/index' }) },
  openTrades() { wx.navigateTo({ url: '/pages/product-orders/list/index' }) }
})
