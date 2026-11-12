const tasksApi = require('../../../services/tasks')
const { taskHint } = require('../../../utils/task-ui')
const { shortId } = require('../../../utils/format')

Page({
  data: { id: '', task: null, orderNumber: '', showCancellation: false, nextHint: '', userId: '', isOwner: false, isHelper: false, isParticipant: false, canDecideCancel: false, messages: [], message: '', sendingMessage: false, loading: false, error: '', acting: false },
  onLoad(options) {
    this.setData({ id: options.id || '' })
  },
  onShow() { return this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  load() {
    if (!this.data.id) return Promise.resolve()
    this.setData({ loading: true, error: '' })
    return getApp().ensureLogin().then(user => {
      this.setData({ userId: user.id })
      return tasksApi.get(this.data.id)
    }).then(task => {
      this.setTask(task)
      this.setData({ loading: false })
      return this.loadMessages()
    }).catch(error => {
      this.setData({ loading: false, task: null, messages: [], error: error.message })
    })
  },
  loadMessages() {
    const task = this.data.task
    if (!task || !this.isParticipant(task)) return Promise.resolve()
    const requestId = (this.messagesRequestId || 0) + 1
    this.messagesRequestId = requestId
    return tasksApi.messages(task.id).then(messages => {
      if (this.messagesRequestId === requestId) this.setData({ messages })
    }).catch(() => {})
  },
  isOwner(task) { return task && String(task.ownerId) === String(this.data.userId) },
  isHelper(task) { return task && String(task.helperId) === String(this.data.userId) },
  isParticipant(task) { return this.isOwner(task) || this.isHelper(task) },
  setTask(task) {
    const isOwner = this.isOwner(task)
    const isHelper = this.isHelper(task)
    this.setData({
      task,
      orderNumber: shortId(task.id),
      showCancellation: (isOwner || isHelper) && ['CANCEL_PENDING', 'CANCEL_DISPUTED'].includes(task.status),
      nextHint: taskHint(task, this.data.userId),
      isOwner,
      isHelper,
      isParticipant: isOwner || isHelper,
      canDecideCancel: task.status === 'CANCEL_PENDING' && (isOwner || isHelper) && String(task.cancelRequestedBy) !== String(this.data.userId)
    })
  },
  perform(action, payload, success) {
    if (this.data.acting) return
    this.setData({ acting: true })
    return tasksApi.action(this.data.id, action, payload).then(task => {
      this.setTask(task)
      if (success) wx.showToast({ title: success, icon: 'success' })
      this.loadMessages()
    }).catch(error => wx.showToast({ title: error.message, icon: 'none' })).finally(() => this.setData({ acting: false }))
  },
  accept() {
    wx.showModal({ title: '确认接单', content: '接单后任务会锁定给你，具体地点只对你和发布者可见。', success: result => {
      if (result.confirm) this.perform('accept', {}, '已接单')
    } })
  },
  markComplete() {
    wx.showModal({ title: '提交完成', content: '提交后请等待发布者确认。', success: result => {
      if (result.confirm) this.perform('complete', {}, '已提交完成')
    } })
  },
  confirmComplete() {
    wx.showModal({ title: '确认完成', content: '确认后任务将结束。', success: result => {
      if (result.confirm) this.perform('confirm', {}, '任务已完成')
    } })
  },
  cancelOpenTask() {
    wx.showModal({ title: '取消任务', content: '确定取消这条尚未接单的任务吗？', success: result => {
      if (result.confirm) this.perform('cancel', {}, '任务已取消')
    } })
  },
  requestCancel() {
    wx.showModal({ title: '申请取消', editable: true, placeholderText: '填写取消原因', success: result => {
      if (result.confirm) this.perform('cancel-request', { reason: (result.content || '').trim() }, '已提交取消申请')
    } })
  },
  decideCancel(event) {
    const accepted = event.currentTarget.dataset.accepted === 'true'
    wx.showModal({ title: accepted ? '同意取消' : '不同意取消', content: accepted ? '确认后任务将取消。' : '不同意后将交由管理员处理，期间暂停任务状态操作。', success: result => {
      if (result.confirm) this.perform('cancel-confirm', { accepted }, accepted ? '任务已取消' : '已拒绝取消')
    } })
  },
  onMessageInput(event) { if (!this.sendingMessage) this.setData({ message: event.detail.value }) },
  sendMessage() {
    if (this.sendingMessage) return this.sendPromise
    const content = this.data.message.trim()
    if (!content) return
    this.sendingMessage = true
    this.messagesRequestId = (this.messagesRequestId || 0) + 1
    this.setData({ sendingMessage: true })
    this.sendPromise = tasksApi.sendMessage(this.data.id, content).then(message => {
      this.setData({ message: '', messages: [...this.data.messages.filter(item => String(item.id) !== String(message.id)), message] })
      return message
    }).catch(error => {
      wx.showToast({ title: error.message, icon: 'none' })
    }).finally(() => {
      this.sendingMessage = false
      this.sendPromise = null
      this.setData({ sendingMessage: false })
    })
    return this.sendPromise
  },
  report() {
    wx.navigateTo({ url: `/pages/report/create/index?type=TASK&id=${this.data.id}` })
  },
  copyOrderNumber() {
    wx.setClipboardData({ data: String(this.data.id), success: () => wx.showToast({ title: '订单编号已复制', icon: 'success' }) })
  }
})
