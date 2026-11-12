const config = require('../../../utils/config')
const auth = require('../../../services/auth')

Page({
  data: {
    user: null, demoMode: config.useDemoData || config.useDemoLogin, switching: false, error: '',
    modeNote: config.useDemoData ? '演示模式：数据只保存在当前设备' : '本地联调：测试账号的数据保存在本机后端，可在管理后台处理'
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
  switchDemoUser() {
    if (!this.data.demoMode || this.data.switching || !this.data.user) return
    this.setData({ switching: true, error: '' })
    if (config.useDemoData) {
      const next = this.data.user.id === 'demo-user'
        ? { id: 'demo-user-2', nickname: '演示同学二' }
        : { id: 'demo-user', nickname: '校园同学' }
      wx.setStorageSync('demoUser', next)
    } else {
      wx.setStorageSync('developmentAccount', wx.getStorageSync('developmentAccount') === 'two' ? 'one' : 'two')
    }
    getApp().globalData.user = null
    getApp().globalData.token = ''
    return this.onShow().finally(() => this.setData({ switching: false }))
  },
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
