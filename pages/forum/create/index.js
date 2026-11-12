const forumApi = require('../../../services/forum')

Page({
  data: { content: '', submitting: false },
  onInput(event) { this.setData({ content: event.detail.value }) },
  submit() {
    if (this.data.submitting) return
    const content = this.data.content.trim()
    if (content.length < 2) {
      wx.showToast({ title: '至少写 2 个字', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    getApp().ensureLogin().then(() => forumApi.create(content)).then(post => {
      wx.showToast({ title: '发布成功', icon: 'success' })
      setTimeout(() => wx.redirectTo({ url: `/pages/forum/detail/index?id=${post.id}` }), 350)
    }).catch(error => {
      this.setData({ submitting: false })
      wx.showToast({ title: error.message, icon: 'none' })
    })
  }
})
