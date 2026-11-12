// Presentation only: permissions and state transitions remain on the server.
function taskHint(task, userId) {
  const owner = String(task.ownerId) === String(userId)
  const helper = String(task.helperId) === String(userId)
  const participant = owner || helper
  if (task.visibility === 'HIDDEN') return '任务已下架，请在订单中查看记录'
  if (task.status === 'OPEN' && task.expired) return '已超过截止时间，暂不可接单'
  switch (task.status) {
    case 'OPEN': return owner ? '等待同学接单，可随时取消' : '接单后可查看具体地点并留言'
    case 'ASSIGNED': return owner ? '任务进行中，可通过留言联系同学' : helper ? '完成跑腿后，请提交完成确认' : '已有同学接下这个任务'
    case 'COMPLETION_PENDING': return owner ? '请核实任务结果，再确认完成' : helper ? '已提交完成，等待发布者确认' : '等待发布者确认完成'
    case 'COMPLETED': return '任务已完成，可查看订单与留言记录'
    case 'CANCEL_PENDING': return participant && String(task.cancelRequestedBy) !== String(userId) ? '对方申请取消，等待你作出决定' : '已申请取消，等待对方确认'
    case 'CANCEL_DISPUTED': return '双方有分歧，等待管理员处理'
    case 'CANCELLED': return '任务已取消，记录为你保留'
    default: return '查看订单详情'
  }
}
function filterOrders(tasks, filter) {
  if (filter === 'active') return tasks.filter(task => !['COMPLETED', 'CANCELLED'].includes(task.status))
  if (filter === 'ended') return tasks.filter(task => ['COMPLETED', 'CANCELLED'].includes(task.status))
  return tasks
}
module.exports = { taskHint, filterOrders }
