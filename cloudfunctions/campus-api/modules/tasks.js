const v = require('../lib/validation')
const { check } = require('../lib/errors')
const { taskView, participant } = require('../lib/views')
const { loadTask, saveTask, activeParticipants } = require('../lib/task-records')
const categories = ['PACKAGE', 'FOOD', 'ERRAND', 'OTHER']
function prepareTask(data) {
  const deadline = data.deadlineAt ? new Date(data.deadlineAt) : null
  check(!deadline || Number.isFinite(deadline.getTime()), 'INVALID_DEADLINE', '截止时间格式不正确')
  const task = {
    title: v.text(data.title, 2, 100, '标题'),
    description: v.text(data.description, 2, 1000, '说明'),
    publicArea: v.text(data.publicArea, 1, 100, '大致区域'),
    exactLocation: v.text(data.exactLocation, 1, 255, '具体地点'),
    category: data.category, rewardCents: v.money(data.rewardAmount),
    deadlineAt: deadline ? deadline.toISOString() : null
  }
  check(categories.includes(task.category), 'INVALID_CATEGORY', '请选择有效的类别')
  check(!task.deadlineAt || Date.parse(task.deadlineAt) > Date.now(), 'INVALID_DEADLINE', '截止时间必须晚于现在')
  return task
}
async function visibleTask(ctx, id) {
  const task = await loadTask(ctx.store, v.id(id))
  check(task.visibility === 'VISIBLE' || participant(task, ctx.actor.id), 'TASK_NOT_FOUND', '任务不存在或已下架')
  return task
}
const routes = {
  'tasks.list': { async run(ctx, data) {
    const filter = { status: 'OPEN', visibility: 'VISIBLE' }
    if (categories.includes(data.category)) filter.category = data.category
    const tasks = await ctx.store.list('tasks', filter)
    return { tasks: tasks.filter(task => !task.deadlineAt || task.deadlineAt > ctx.now).map(task => taskView(task, ctx.actor.id, true)) }
  }},
  'tasks.mine': { async run(ctx, data) {
    const key = data.role === 'helper' ? 'helperId' : 'ownerId'
    return { tasks: (await ctx.store.list('tasks', { [key]: ctx.actor.id }, 'updatedAt')).map(task => taskView(task, ctx.actor.id)) }
  }},
  'tasks.get': { async run(ctx, data) { return { task: taskView(await visibleTask(ctx, data.id), ctx.actor.id) } }},
  'tasks.create': {
    write: true, prepare: prepareTask,
    content: data => [data.title, data.description, data.publicArea, data.exactLocation].join('\n'),
    async run(ctx, data) {
      check(!data.deadlineAt || data.deadlineAt > ctx.now, 'INVALID_DEADLINE', '截止时间必须晚于现在')
      const task = { ...data, id: v.hash('task', ctx.operationId), ownerId: ctx.actor.id, ownerNickname: ctx.actor.nickname,
        helperId: null, helperNickname: null, status: 'OPEN', visibility: 'VISIBLE',
        cancelRequestedBy: null, cancelReason: null, cancelResumeStatus: null,
        createdAt: ctx.now, updatedAt: ctx.now }
      await saveTask(ctx, task, 'CREATED')
      return { task: taskView(task, ctx.actor.id) }
    }
  }
}
for (const action of ['accept', 'complete', 'confirm', 'cancel', 'cancel-request', 'cancel-confirm']) {
  routes['tasks.' + action] = {
    write: true,
    prepare(data) {
      const result = { id: v.id(data.id) }
      if (action === 'cancel-request') result.reason = v.text(data.reason, 2, 300, '取消原因')
      if (action === 'cancel-confirm') result.accepted = v.bool(data.accepted)
      return result
    },
    content: data => data.reason,
    async run(ctx, data) {
      const task = await loadTask(ctx.store, data.id)
      const actor = ctx.actor.id
      let eventType
      if (action === 'accept') {
        check(task.ownerId !== actor, 'CANNOT_ACCEPT_OWN_TASK', '不能接自己发布的任务')
        check(task.status === 'OPEN' && task.visibility === 'VISIBLE' && (!task.deadlineAt || task.deadlineAt > ctx.now), 'TASK_NOT_OPEN', '任务已被接单、已过期或已关闭')
        await activeParticipants(ctx.store, task)
        task.helperId = actor; task.helperNickname = ctx.actor.nickname; task.status = 'ASSIGNED'
        eventType = 'ACCEPTED'
      } else {
        check(participant(task, actor), 'FORBIDDEN', '只有订单双方可以操作')
        if (action === 'complete') {
          check(task.helperId === actor, 'FORBIDDEN', '只有接单者可以标记完成')
          check(task.status === 'ASSIGNED', 'INVALID_TASK_STATE', '当前任务状态不能标记完成')
          task.status = 'COMPLETION_PENDING'; eventType = 'COMPLETION_SUBMITTED'
        } else if (action === 'confirm') {
          check(task.ownerId === actor, 'FORBIDDEN', '只有发布者可以确认完成')
          check(task.status === 'COMPLETION_PENDING', 'INVALID_TASK_STATE', '没有待确认的完成申请')
          task.status = 'COMPLETED'; eventType = 'COMPLETED'
        } else if (action === 'cancel') {
          check(task.ownerId === actor, 'FORBIDDEN', '只有发布者可以取消未接单任务')
          check(task.status === 'OPEN', 'INVALID_TASK_STATE', '已接单任务需要申请取消')
          task.status = 'CANCELLED'; eventType = 'CANCELLED_BEFORE_ACCEPT'
        } else if (action === 'cancel-request') {
          check(['ASSIGNED', 'COMPLETION_PENDING'].includes(task.status), 'INVALID_TASK_STATE', '当前状态不能申请取消')
          task.cancelResumeStatus = task.status
          task.status = 'CANCEL_PENDING'; task.cancelReason = data.reason; task.cancelRequestedBy = actor
          eventType = 'CANCEL_REQUESTED'
        } else {
          check(task.cancelRequestedBy !== actor, 'FORBIDDEN', '只有另一方可以处理取消申请')
          check(task.status === 'CANCEL_PENDING', 'INVALID_TASK_STATE', '没有待处理的取消申请')
          task.status = data.accepted ? 'CANCELLED' : 'CANCEL_DISPUTED'
          eventType = data.accepted ? 'CANCEL_APPROVED' : 'CANCEL_DECLINED'
        }
        await activeParticipants(ctx.store, task)
      }
      await saveTask(ctx, task, eventType, data.reason ? { reason: data.reason } : {})
      return { task: taskView(task, actor) }
    }
  }
}
module.exports = routes
