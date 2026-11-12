const forumApi = require('../../../services/forum')
const config = require('../../../utils/config')

Page({
  data: { posts: [], loading: false, error: '', demoMode: config.useDemoData },
  onShow() { this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  load() {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, error: '' })
    return getApp().ensureLogin().then(() => forumApi.list())
      .then(posts => { if (this.requestId === requestId) this.setData({ posts, loading: false }) })
      .catch(error => { if (this.requestId === requestId) this.setData({ error: error.message, loading: false }) })
  },
  createPost() { wx.navigateTo({ url: '/pages/forum/create/index' }) },
  openPost(event) { wx.navigateTo({ url: `/pages/forum/detail/index?id=${event.currentTarget.dataset.id}` }) }
})
