const market = require('../../../services/market')
const { categories } = require('../../../utils/market')
Page({
  data: { categories, category: 'ALL', keyword: '', sort: 'recommended', products: [], cursor: '', loading: false, error: '', favoritesBusy: {} },
  onShow() { return this.load() },
  onHide() { clearTimeout(this.searchTimer) },
  onUnload() { this.request = (this.request || 0) + 1; clearTimeout(this.searchTimer) },
  onPullDownRefresh() { return this.load().finally(() => wx.stopPullDownRefresh()) },
  onReachBottom() { if (this.data.cursor && !this.data.loading) return this.load(true) },
  async load(append = false) {
    append = append === true
    if (append && (!this.data.cursor || this.data.loading)) return
    const request = this.request = (this.request || 0) + 1
    // Only writes acknowledged during this read can supersede its snapshot.
    this.favoriteReceipts = new Map()
    const query = { q: this.data.keyword, category: this.data.category, sort: this.data.sort, cursor: append ? this.data.cursor : '' }
    this.setData({ loading: true, error: '', ...(append ? {} : { products: [], cursor: '' }) })
    try {
      await getApp().ensureLogin()
      const result = await market.list(query)
      if (request !== this.request) return
      const combined = append ? [...this.data.products, ...result.products] : result.products
      const products = [...new Map(combined.map(item => [item.id, item])).values()].map(item => {
        const receipt = this.favoriteReceipts.get(item.id)
        return receipt ? { ...item, favorited: receipt.active, favoriteCount: receipt.favoriteCount } : item
      })
      this.setData({ products, cursor: result.nextCursor, loading: false })
    } catch (error) { if (request === this.request) this.setData({ loading: false, error: error.message }) }
  },
  onSearch(event) {
    this.request = (this.request || 0) + 1
    this.setData({ keyword: event.detail.value, loading: false })
    clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.load(), 350)
  },
  searchNow() { clearTimeout(this.searchTimer); return this.load() },
  clearSearch() { this.setData({ keyword: '' }); return this.searchNow() },
  selectCategory(event) { this.setData({ category: event.currentTarget.dataset.value }); return this.searchNow() },
  selectSort(event) { this.setData({ sort: event.currentTarget.dataset.value }); return this.searchNow() },
  open(event) { wx.navigateTo({ url: '/pages/products/detail/index?id=' + event.detail.id }) },
  publish() { wx.navigateTo({ url: '/pages/products/create/index' }) },
  loadMore() { return this.load(true) },
  async favorite(event) {
    const { id, active } = event.detail
    if (this.data.favoritesBusy[id]) return
    this.setData({ favoritesBusy: { ...this.data.favoritesBusy, [id]: true } })
    try {
      const result = await market.favorite(id, active)
      if (!this.favoriteReceipts) this.favoriteReceipts = new Map()
      this.favoriteReceipts.set(id, result)
      this.setData({ products: this.data.products.map(p => p.id === id ? { ...p, favorited: result.active, favoriteCount: result.favoriteCount } : p) })
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }) }
    finally { this.setData({ favoritesBusy: { ...this.data.favoritesBusy, [id]: false } }) }
  }
})
