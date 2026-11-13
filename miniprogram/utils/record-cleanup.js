function confirmClear(title, content) {
  return new Promise((resolve, reject) => wx.showModal({
    title, content, confirmText: '确认清理', confirmColor: '#aa3e3e',
    success: result => resolve(result.confirm),
    fail: () => reject(new Error('暂时无法打开确认窗口，请重试'))
  }))
}
async function clearBatches(ids, clear, onProgress) {
  const unique = [...new Set(ids)]
  for (let start = 0; start < unique.length; start += 20) {
    const batch = unique.slice(start, start + 20)
    const result = await clear(batch)
    if (!Array.isArray(result.clearedIds) || batch.some(id => !result.clearedIds.includes(id))) {
      throw new Error('部分记录未能清理，请刷新后重试')
    }
    if (onProgress) onProgress(result.clearedIds)
  }
}
module.exports = { confirmClear, clearBatches }
