const auth = require('../../../services/auth')
const { openOrderCenter } = require('../../../utils/order-center')

Page({
  data: {
    user: null, error: ''
  },
  onShow() {
    return getApp().ensureLogin().then(user => this.setData({ user: { ...user, initial: (user.nickname || '同').slice(0, 1) }, error: '' })).catch(error => {
      this.setData({ error: error.message })
    })
  },
  openOrders(event) { openOrderCenter(event.currentTarget.dataset.kind || 'market', event.currentTarget.dataset.role) },
  openReports() { wx.navigateTo({ url: '/pages/report/list/index' }) },
  openTrash() { wx.navigateTo({ url: '/pages/order-trash/index' }) },
  openProducts(event) { wx.navigateTo({ url: '/pages/products/library/index?mode=' + event.currentTarget.dataset.mode }) },
  openTrades(event) { openOrderCenter('market', event.currentTarget.dataset.role) },
  editNickname() {
    wx.showModal({ title: '设置昵称', editable: true, placeholderText: '输入校园昵称', success: result => {
      const nickname = (result.content || '').trim().slice(0, 40)
      if (!result.confirm || nickname.length < 1) return
      auth.updateNickname(nickname).then(result => {
        getApp().globalData.user = result.user
        this.setData({ user: { ...result.user, initial: nickname.slice(0, 1) } })
        wx.showToast({ title: '昵称已更新', icon: 'success' })
      }).catch(error => wx.showToast({ title: error.message, icon: 'none' }))
    } })
  }
})
