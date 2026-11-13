const market = require('../../../services/market')
Page({
  data: { mode: 'mine', products: [], loading: false, cursor: '', error: '', favoritesBusy: {} },
  onLoad(options) { this.setData({ mode: options.mode === 'favorites' ? 'favorites' : 'mine' }) },
  onShow() { return this.load() },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { return this.load(true) },
  select(e) { this.setData({ mode: e.currentTarget.dataset.mode }); return this.load() },
  async load(append = false) {
    append = append === true
    if (append && (!this.data.cursor || this.data.loading)) return
    const request = this.request = (this.request || 0) + 1, mode = this.data.mode, cursor = append ? this.data.cursor : ''
    this.setData({ loading: true, error: '', ...(append ? {} : { products: [], cursor: '' }) })
    try {
      await getApp().ensureLogin(); const r = await market[mode]({ cursor })
      if (request !== this.request) return
      const items = append ? [...this.data.products, ...r.products] : r.products
      this.setData({ products: [...new Map(items.map(p => [p.id, p])).values()], cursor: r.nextCursor, loading: false })
    } catch (e) { if (request === this.request) this.setData({ error: e.message, loading: false }) }
  },
  loadMore() { return this.load(true) },
  open(e) { wx.navigateTo({ url: '/pages/products/detail/index?id=' + e.detail.id }) },
  publish() { wx.navigateTo({ url: '/pages/products/create/index' }) },
  discover() { wx.switchTab({ url: '/pages/products/list/index' }) },
  async favorite(e) {
    const id = e.detail.id
    const mode = this.data.mode
    if (this.data.favoritesBusy[id]) return
    this.setData({ favoritesBusy: { ...this.data.favoritesBusy, [id]: true } })
    try {
      await market.favorite(id, false)
      if (this.data.mode === mode) {
        this.request = (this.request || 0) + 1
        this.setData({ products: this.data.products.filter(p => p.id !== id), loading: false })
      }
    }
    catch (e) { wx.showToast({ title: e.message, icon: 'none' }) }
    finally { this.setData({ favoritesBusy: { ...this.data.favoritesBusy, [id]: false } }) }
  }
})
