const auth = require('../../../services/auth')

Page({
  data: {
    user: null, error: ''
  },
  onShow() {
    return getApp().ensureLogin().then(user => this.setData({ user: { ...user, initial: (user.nickname || '同').slice(0, 1) }, error: '' })).catch(error => {
      this.setData({ error: error.message })
    })
  },
  openOrders(event) {
    const role = event.currentTarget.dataset.role
    if (role) getApp().profileOrderRole = role
    wx.switchTab({ url: '/pages/orders/list/index' })
  },
  openReports() { wx.navigateTo({ url: '/pages/report/list/index' }) },
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
