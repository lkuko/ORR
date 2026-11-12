const tasksApi = require('../../../services/tasks')
const { taskError } = require('../../../utils/validate')

const categoryOptions = [
  { value: 'PACKAGE', label: '快递代取' },
  { value: 'FOOD', label: '餐饮/代买' },
  { value: 'ERRAND', label: '校园代办' },
  { value: 'OTHER', label: '其他' }
]

Page({
  data: {
    categoryOptions,
    categoryIndex: 0,
    deadlineDate: '',
    submitting: false,
    form: { title: '', description: '', publicArea: '', exactLocation: '', rewardAmount: '' }
  },
  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },
  onCategoryChange(event) {
    this.setData({ categoryIndex: Number(event.detail.value) })
  },
  onDateChange(event) {
    this.setData({ deadlineDate: event.detail.value })
  },
  submit() {
    if (this.data.submitting) return
    const form = this.data.form
    const error = taskError(form)
    if (error) {
      wx.showToast({ title: error, icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    getApp().ensureLogin().then(() => tasksApi.create({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      publicArea: form.publicArea.trim(),
      exactLocation: form.exactLocation.trim(),
      category: categoryOptions[this.data.categoryIndex].value,
      deadlineAt: this.data.deadlineDate ? `${this.data.deadlineDate}T23:59:59+08:00` : null
    })).then(task => {
      wx.showToast({ title: '任务已发布', icon: 'success' })
      setTimeout(() => wx.redirectTo({ url: `/pages/tasks/detail/index?id=${task.id}` }), 350)
    }).catch(error => {
      this.setData({ submitting: false })
      wx.showToast({ title: error.message, icon: 'none' })
    })
  }
})
