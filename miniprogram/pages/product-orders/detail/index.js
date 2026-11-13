const market = require('../../../services/market')
const { confirm } = require('../../../utils/dialog')
const { dateTime } = require('../../../utils/format')
const { archiveOrder } = require('../../../utils/trade-record')
const formatMessage = m => ({ ...m, createdLabel: dateTime(m.createdAt) })
Page({
  data: { order: null, loading: false, error: '', acting: false, messages: [], messageCursor: '', messageLoading: false, messageError: '', draft: '', sending: false, messageFocus: false },
  onLoad(options) { this.id = options.id },
  onShow() { return this.load() },
  async load() {
    const request = this.request = (this.request || 0) + 1
    const messageRequest = this.messageRequest = (this.messageRequest || 0) + 1
    this.setData({ loading: true, error: '', messageLoading: false })
    try {
      await getApp().ensureLogin(); const result = await market.orderDetail(this.id)
      if (request !== this.request) return
      this.setData({ order: result.order, loading: false })
      if (messageRequest === this.messageRequest) this.setData({ messages: result.messages.map(formatMessage).reverse(), messageCursor: result.nextCursor, messageLoading: false, messageError: '' })
    } catch (e) { if (request === this.request) this.setData({ loading: false, error: e.message }) }
  },
  async loadMessages(older = false) {
    older = older === true
    if (older && (!this.data.messageCursor || this.data.messageLoading)) return
    const request = this.messageRequest = (this.messageRequest || 0) + 1
    this.setData({ messageLoading: true, messageError: '' })
    try {
      const r = await market.messages({ id: this.id, cursor: older ? this.data.messageCursor : '', pageSize: 40 })
      if (request !== this.messageRequest) return
      const fresh = r.messages.map(formatMessage).reverse(), items = older ? [...fresh, ...this.data.messages] : fresh
      this.setData({ messages: [...new Map(items.map(m => [m.id, m])).values()], messageCursor: r.nextCursor, messageLoading: false })
    } catch (e) { if (request === this.messageRequest) this.setData({ messageLoading: false, messageError: e.message }) }
  },
  older() { return this.loadMessages(true) },
  input(e) { this.setData({ draft: e.detail.value }) },
  async send() {
    const content = this.data.draft.trim()
    if (this.sending || !content) return
    this.sending = true; this.setData({ sending: true, messageError: '' })
    try {
      const message = await market.send(this.id, content)
      this.messageRequest = (this.messageRequest || 0) + 1
      this.setData({ messages: [...this.data.messages.filter(m => m.id !== message.id), formatMessage(message)], draft: this.data.draft.trim() === content ? '' : this.data.draft, messageLoading: false })
    } catch (e) { this.setData({ messageError: e.message }) }
    finally { this.sending = false; this.setData({ sending: false }) }
  },
  async action(e) {
    if (this.acting) return
    this.acting = true; this.setData({ acting: true })
    const action = e.currentTarget.dataset.action, data = {}
    try {
      let decision
      if (action === 'cancel') {
        decision = await confirm('填写取消原因', '输入 2–300 字的取消说明', true)
        if (!decision.confirm) return
        data.reason = (decision.content || '').trim()
      } else if (action === 'cancelRespond') {
        data.agree = e.currentTarget.dataset.agree === true || e.currentTarget.dataset.agree === 'true'
        decision = await confirm(data.agree ? '同意取消交易' : '交管理员处理', data.agree ? '同意后订单取消，商品可再次预约。' : '此交易将进入争议状态，由管理员核实处理。')
      } else decision = await confirm(action === 'accept' ? '确认买家预约' : '确认交易完成', action === 'accept' ? '确认后请通过留言与买家约定当面交付。' : '请确认已经当面验货、收到商品并完成线下付款。确认后交易结束。')
      if (!decision.confirm) return
      const order = await market.orderAction(this.id, action, data)
      this.request = (this.request || 0) + 1; this.setData({ order, loading: false })
      wx.showToast({ title: '操作成功', icon: 'success' })
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }) }
    finally { this.acting = false; this.setData({ acting: false }) }
  },
  async archive() {
    if (this.acting || !this.data.order.canArchive) return
    this.acting = true; this.setData({ acting: true })
    try {
      const order = await archiveOrder(this.id)
      if (order) { this.request = (this.request || 0) + 1; this.setData({ order, loading: false }); wx.showToast({ title: '已移入回收站', icon: 'success' }) }
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }) }
    finally { this.acting = false; this.setData({ acting: false }) }
  },
  async restore() {
    if (this.acting || !this.data.order.archived) return
    this.acting = true; this.setData({ acting: true })
    try {
      const order = await market.orderAction(this.id, 'restore')
      this.request = (this.request || 0) + 1; this.setData({ order, loading: false })
      wx.showToast({ title: '已恢复记录', icon: 'success' })
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }) }
    finally { this.acting = false; this.setData({ acting: false }) }
  },
  contact() { wx.pageScrollTo({ selector: '#trade-messages', duration: 200, success: () => this.setData({ messageFocus: true }) }) },
  focusMessage() { this.setData({ messageFocus: true }) },
  blurMessage() { this.setData({ messageFocus: false }) },
  copy() { wx.setClipboardData({ data: this.id }) },
  report() {
    if (this.data.order?.isBuyer) wx.navigateTo({ url: '/pages/report/create/index?type=PRODUCT&id=' + this.data.order.productId })
  },
  product() { wx.navigateTo({ url: '/pages/products/detail/index?id=' + this.data.order.productId }) }
})
