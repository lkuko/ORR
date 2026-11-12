function taskError(form) {
  if (form.title.trim().length < 2 || form.description.trim().length < 2) return '请填写至少 2 字的标题和说明'
  if (!form.publicArea.trim() || !form.exactLocation.trim()) return '请填写大致区域和具体地点'
  if (form.rewardAmount !== '' && !/^\d{1,6}(\.\d{1,2})?$/.test(form.rewardAmount)) return '报酬最多保留两位小数'
  return ''
}
module.exports = { taskError }
