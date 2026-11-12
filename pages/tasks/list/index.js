const tasksApi = require('../../../services/tasks')
const config = require('../../../utils/config')

const categories = [
  { value: 'ALL', label: '全部' },
  { value: 'PACKAGE', label: '取快递' },
  { value: 'FOOD', label: '餐饮代买' },
  { value: 'ERRAND', label: '校园代办' },
  { value: 'OTHER', label: '其他' }
]

Page({
  data: { categories, category: 'ALL', keyword: '', tasks: [], loading: false, error: '', demoMode: config.useDemoData },
  onShow() { this.loadTasks() },
  onPullDownRefresh() {
    this.loadTasks().finally(() => wx.stopPullDownRefresh())
  },
  loadTasks() {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, error: '' })
    return getApp().ensureLogin().then(() => tasksApi.list({ category: this.data.category }))
      .then(tasks => { if (this.requestId !== requestId) return; this.loadedTasks = tasks; this.setData({ loading: false }); this.filterTasks() })
      .catch(error => { if (this.requestId === requestId) this.setData({ error: error.message, loading: false }) })
  },
  filterTasks(keyword = this.data.keyword) {
    const query = keyword.trim().toLowerCase()
    this.setData({ keyword, tasks: (this.loadedTasks || []).filter(task => !query || `${task.title} ${task.publicArea}`.toLowerCase().includes(query)) })
  },
  onSearch(event) { this.filterTasks(event.detail.value) },
  clearSearch() { this.filterTasks('') },
  emptyAction() { if (this.data.keyword) this.clearSearch(); else this.openCreate() },
  selectCategory(event) {
    const category = event.currentTarget.dataset.value
    if (category === this.data.category) return
    this.loadedTasks = []
    this.setData({ category, tasks: [] })
    this.loadTasks()
  },
  openTask(event) {
    const id = event.detail?.id || event.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/tasks/detail/index?id=${id}` })
  },
  openCreate() {
    wx.navigateTo({ url: '/pages/tasks/create/index' })
  },
  categoryName(value) {
    const match = categories.find(item => item.value === value)
    return match ? match.label : '其他'
  }
})
