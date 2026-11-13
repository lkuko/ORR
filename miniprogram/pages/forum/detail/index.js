const forumApi = require('../../../services/forum')

Page({
  data: { id: '', post: null, comments: [], commentText: '', loading: false, submitting: false, error: '' },
  onLoad(options) { this.setData({ id: options.id || '' }) },
  onShow() { return this.load() },
  load() {
    if (this.submitting) return Promise.resolve()
    const request = this.request = (this.request || 0) + 1
    this.setData({ loading: true, error: '' })
    return getApp().ensureLogin().then(() => forumApi.get(this.data.id))
      .then(post => { if (request === this.request) this.setData({ post, comments: post.comments || [], loading: false }) })
      .catch(error => {
        if (request === this.request) this.setData({ loading: false, post: null, comments: [], error: error.message })
      })
  },
  onCommentInput(event) { this.setData({ commentText: event.detail.value }) },
  submitComment() {
    const content = this.data.commentText.trim()
    if (!content || this.submitting || !this.data.post) return
    this.submitting = true
    const currentPost = this.data.post
    this.request = (this.request || 0) + 1
    this.setData({ submitting: true, loading: false, error: '' })
    return forumApi.comment(this.data.id, content).then(({ comment, commentCount }) => {
      this.request = (this.request || 0) + 1
      const exists = this.data.comments.some(item => item.id === comment.id)
      const comments = exists ? this.data.comments : [...this.data.comments, comment]
      const post = this.data.post || currentPost
      const count = Number.isInteger(commentCount) ? Math.max(commentCount, comments.length) : post.commentCount + (exists ? 0 : 1)
      this.setData({ comments, post: { ...post, comments, commentCount: count }, loading: false, error: '',
        commentText: this.data.commentText.trim() === content ? '' : this.data.commentText })
    }).catch(error => wx.showToast({ title: error.message, icon: 'none' })).finally(() => { this.submitting = false; this.setData({ submitting: false }) })
  },
  reportComment(event) {
    const id = event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/report/create/index?type=COMMENT&id=${encodeURIComponent(id)}` })
  },
  report() { wx.navigateTo({ url: `/pages/report/create/index?type=POST&id=${this.data.id}` }) }
})
