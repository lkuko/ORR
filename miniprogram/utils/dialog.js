function confirm(title, content, editable = false) {
  return new Promise(resolve => wx.showModal({ title, content: editable ? '' : content, editable,
    placeholderText: editable ? content : '', success: resolve, fail: () => resolve({ confirm: false }) }))
}
module.exports = { confirm }
