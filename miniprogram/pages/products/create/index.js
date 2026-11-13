const market = require('../../../services/market')
const images = require('../../../services/images')
const { categories, conditions } = require('../../../utils/market')
const labels = { UPLOADING: '上传中', PENDING: '安全检查中', PASSED: '检查通过', REJECTED: '未通过，请更换', ERROR: '检查异常，可重试' }
Page({
  data: { title: '', description: '', price: '', publicArea: '', categories: categories.slice(1), categoryIndex: 0, conditions, conditionIndex: 2,
    images: [], uploading: false, checking: false, submitting: false, error: '', uploadError: '' },
  onLoad() { getApp().ensureLogin().catch(e => this.setData({ error: e.message })) },
  onShow() { this.active = true; this.schedule() },
  onHide() { this.active = false; clearTimeout(this.timer) },
  onUnload() { this.active = false; clearTimeout(this.timer) },
  markDirty() { if (wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '商品还未发布，离开会丢失本页内容。' }) },
  input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); this.markDirty() },
  category(e) { this.setData({ categoryIndex: Number(e.detail.value) }); this.markDirty() },
  condition(e) { this.setData({ conditionIndex: Number(e.detail.value) }); this.markDirty() },
  async choose() {
    if (this.data.uploading || this.data.submitting || this.data.images.length >= 6) return
    this.setData({ uploading: true, uploadError: '' })
    try {
      await getApp().ensureLogin()
      const selected = await images.choose(6 - this.data.images.length)
      this.markDirty()
      for (const file of selected.tempFiles) {
        const item = await images.upload(file.tempFilePath)
        this.setData({ images: [...this.data.images, { ...item, label: labels[item.status] }] })
      }
    } catch (e) {
      if (!/cancel/.test(e.errMsg || '')) this.setData({ uploadError: e.message || '图片上传失败，请重新选择后重试' })
    } finally { this.setData({ uploading: false }); this.schedule() }
  },
  remove(e) { if (!this.data.submitting) this.setData({ images: this.data.images.filter((_, i) => i !== Number(e.currentTarget.dataset.index)) }) },
  preview(e) { wx.previewImage({ current: e.currentTarget.dataset.path, urls: this.data.images.map(i => i.path) }) },
  schedule() {
    clearTimeout(this.timer)
    if (this.active && this.data.images.some(i => ['PENDING', 'UPLOADING'].includes(i.status))) this.timer = setTimeout(() => this.refreshImages(), 8000)
  },
  async refreshImages() {
    if (this.data.checking || !this.data.images.length) return
    const ids = this.data.images.map(i => i.id)
    this.setData({ checking: true })
    try {
      const statuses = await market.mediaStatus(ids), byId = new Map(statuses.map(i => [i.id, i]))
      this.setData({ images: this.data.images.map(i => byId.has(i.id) ? { ...i, status: byId.get(i.id).status, label: labels[byId.get(i.id).status] } : i) })
    } catch (e) { this.setData({ uploadError: e.message }) }
    finally { this.setData({ checking: false }); this.schedule() }
  },
  async retryImage(e) {
    if (this.data.checking) return
    const id = e.currentTarget.dataset.id
    this.setData({ checking: true, uploadError: '' })
    try {
      await market.retryMedia(id)
      this.setData({ images: this.data.images.map(i => i.id === id ? { ...i, status: 'PENDING', label: labels.PENDING } : i) })
    } catch (e) { this.setData({ uploadError: e.message }) }
    finally { this.setData({ checking: false }); this.schedule() }
  },
  async submit() {
    if (this.submitting || this.data.uploading) return
    this.submitting = true; this.setData({ submitting: true, error: '' })
    try {
      await getApp().ensureLogin()
      await this.refreshImages()
      if (!this.data.images.length || this.data.images.some(i => i.status !== 'PASSED')) throw new Error('请添加照片，并等待全部图片检查通过')
      const result = await market.create({ title: this.data.title.trim(), description: this.data.description.trim(), price: this.data.price,
        publicArea: this.data.publicArea.trim(), category: this.data.categories[this.data.categoryIndex].value,
        condition: this.data.conditions[this.data.conditionIndex].value, imageIds: this.data.images.map(i => i.id) })
      if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
      wx.redirectTo({ url: '/pages/products/detail/index?id=' + result.product.id })
    } catch (e) { this.setData({ error: e.message }) }
    finally { this.submitting = false; this.setData({ submitting: false }) }
  }
})
