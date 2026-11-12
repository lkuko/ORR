const forumApi = require('../../../services/forum')

Page({
  data: { id: '', post: null, comments: [], commentText: '', loading: false, submitting: false, error: '' },
  onLoad(options) { this.setData({ id: options.id || '' }) },
  onShow() { this.load() },
  load() {
    this.setData({ loading: true, error: '' })
    return getApp().ensureLogin().then(() => forumApi.get(this.data.id))
      .then(post => this.setData({ post, comments: post.comments || [], loading: false }))
      .catch(error => {
        this.setData({ loading: false, post: null, comments: [], error: error.message })
      })
  },
  onCommentInput(event) { this.setData({ commentText: event.detail.value }) },
  submitComment() {
    const content = this.data.commentText.trim()
    if (!content || this.data.submitting) return
    this.setData({ submitting: true })
    return forumApi.comment(this.data.id, content).then(() => {
      this.setData({ commentText: '' })
      return this.load()
    }).catch(error => wx.showToast({ title: error.message, icon: 'none' })).finally(() => this.setData({ submitting: false }))
  },
  reportComment(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/report/create/index?type=COMMENT&id=${encodeURIComponent(id)}` })
  },
  report() { wx.navigateTo({ url: `/pages/report/create/index?type=POST&id=${this.data.id}` }) }
})
