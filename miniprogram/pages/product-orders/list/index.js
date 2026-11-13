const market = require('../../../services/market')
const { archiveOrder } = require('../../../utils/trade-record')
Page({
  data: { role: 'buyer', status: 'all', view: 'list', filters: [{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'ended', label: '已结束' }], orders: [], loading: false, cursor: '', error: '', busyId: '' },
  onLoad(options) { this.setData({ role: options.role === 'seller' ? 'seller' : 'buyer', view: options.view === 'trash' ? 'trash' : 'list' }) },
  onShow() { return this.load() },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { return this.load(true) },
  selectRole(e) { this.setData({ role: e.currentTarget.dataset.role }); return this.load() },
  selectStatus(e) { this.setData({ status: e.currentTarget.dataset.value, view: 'list' }); return this.load() },
  selectView(e) { this.setData({ view: e.currentTarget.dataset.view, status: 'all' }); return this.load() },
  async load(append = false) {
    append = append === true
    if (append && (!this.data.cursor || this.data.loading)) return
    const request = this.request = (this.request || 0) + 1
    const query = { role: this.data.role, status: this.data.status, view: this.data.view, cursor: append ? this.data.cursor : '' }
    this.setData({ loading: true, error: '', ...(append ? {} : { orders: [], cursor: '' }) })
    try {
      await getApp().ensureLogin(); const r = await market.orders(query)
      if (request !== this.request) return
      const items = append ? [...this.data.orders, ...r.orders] : r.orders
      this.setData({ orders: [...new Map(items.map(o => [o.id, o])).values()], cursor: r.nextCursor, loading: false })
    } catch (e) { if (request === this.request) this.setData({ error: e.message, loading: false }) }
  },
  loadMore() { return this.load(true) },
  archive(e) { return this.changeRecord(e.currentTarget.dataset.id, false) },
  restore(e) { return this.changeRecord(e.currentTarget.dataset.id, true) },
  async changeRecord(id, restore) {
    if (this.busy) return
    const item = this.data.orders.find(order => order.id === id)
    if (!item || (restore ? !item.archived : !item.canArchive)) return
    this.busy = true; this.setData({ busyId: id })
    const role = this.data.role, view = this.data.view, status = this.data.status
    try {
      const order = restore ? await market.orderAction(id, 'restore') : await archiveOrder(id)
      if (!order) return
      if (role === this.data.role && view === this.data.view && status === this.data.status) {
        const refresh = this.data.loading && !this.data.orders.length
        this.request = (this.request || 0) + 1
        this.setData({ orders: this.data.orders.filter(row => row.id !== id), loading: false })
        if (refresh) await this.load()
      }
      wx.showToast({ title: restore ? '已恢复记录' : '已移入回收站', icon: 'success' })
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }) }
    finally { this.busy = false; this.setData({ busyId: '' }) }
  },
  open(e) { wx.navigateTo({ url: '/pages/product-orders/detail/index?id=' + e.currentTarget.dataset.id }) },
  discover() { wx.switchTab({ url: '/pages/products/list/index' }) }
})
