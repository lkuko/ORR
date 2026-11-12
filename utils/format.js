const categoryLabels = { PACKAGE: '快递代取', FOOD: '餐饮代买', ERRAND: '校园代办', OTHER: '其他' }
const statusLabels = { OPEN: '待接单', ASSIGNED: '进行中', COMPLETION_PENDING: '待确认完成', COMPLETED: '已完成', CANCEL_PENDING: '待确认取消', CANCEL_DISPUTED: '待管理员处理', CANCELLED: '已取消' }
function dateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = number => String(number).padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function taskView(task) {
  const rewardLabel = task.rewardAmount == null ? '互助' : '¥' + Number(task.rewardAmount).toFixed(2)
  return { ...task, categoryLabel: categoryLabels[task.category] || '其他', statusLabel: statusLabels[task.status] || '未知状态', createdLabel: dateTime(task.createdAt), deadlineLabel: dateTime(task.deadlineAt), rewardLabel, hasReward: task.rewardAmount !== null && task.rewardAmount !== undefined, expired: !!task.deadlineAt && new Date(task.deadlineAt).getTime() <= Date.now() }
}
function postView(post) {
  return { ...post, authorInitial: (post.authorNickname || '同').slice(0, 1), createdLabel: dateTime(post.createdAt), commentCount: Number(post.commentCount || (post.comments || []).length), comments: (post.comments || []).map(comment => ({ ...comment, authorInitial: (comment.authorNickname || '同').slice(0, 1), createdLabel: dateTime(comment.createdAt) })) }
}
module.exports = { categoryLabels, statusLabels, dateTime, taskView, postView }
