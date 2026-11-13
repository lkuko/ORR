const market = require('../../../services/market')
const { confirm } = require('../../../utils/dialog')
Page({
  data: { product: null, loading: false, error: '', acting: false, favoriteBusy: false },
  onLoad(options) { this.id = options.id },
  onShow() { return this.load() },
  async load() {
    const request = this.request = (this.request || 0) + 1
    this.setData({ loading: true, error: '' })
    try {
      await getApp().ensureLogin(); const product = await market.get(this.id)
      if (request === this.request) this.setData({ product, loading: false })
    } catch (e) { if (request === this.request) this.setData({ product: null, loading: false, error: e.message }) }
  },
  preview(e) { wx.previewImage({ current: e.currentTarget.dataset.url, urls: this.data.product.urls }) },
  async favorite() {
    if (this.favoriteBusy) return
    this.favoriteBusy = true; this.setData({ favoriteBusy: true })
    try {
      const r = await market.favorite(this.id, !this.data.product.favorited)
      this.request = (this.request || 0) + 1
      this.setData({ loading: false, product: { ...this.data.product, favorited: r.active, favoriteCount: r.favoriteCount } })
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }) }
    finally { this.favoriteBusy = false; this.setData({ favoriteBusy: false }) }
  },
  async reserve() {
    if (this.acting) return
    this.acting = true; this.setData({ acting: true })
    try {
      const decision = await confirm('预约并联系卖家', '预约后直接进入待交付，请通过留言约定时间。当面验货、线下结算，小程序不会扣款。')
      if (!decision.confirm) return
      const order = await market.reserve(this.id)
      wx.navigateTo({ url: '/pages/product-orders/detail/index?id=' + order.id })
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }); await this.load() }
    finally { this.acting = false; this.setData({ acting: false }) }
  },
  async setStatus() {
    if (this.acting) return
    this.acting = true; this.setData({ acting: true })
    try {
      const available = this.data.product.status === 'WITHDRAWN'
      if (!(await confirm(available ? '重新上架' : '下架商品', available ? '重新上架后，同学可以搜索和预约此商品。' : '下架后不再出现在商品列表，可从我的发布重新上架。')).confirm) return
      await market.setStatus(this.id, available); await this.load()
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }) }
    finally { this.acting = false; this.setData({ acting: false }) }
  },
  orders() { require('../../../utils/order-center').openOrderCenter('market', 'seller') },
  report() { wx.navigateTo({ url: '/pages/report/create/index?type=PRODUCT&id=' + this.id }) },
  copy() { wx.setClipboardData({ data: this.id }) }
})
