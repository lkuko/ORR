const { check } = require('./errors')
const { hash } = require('./validation')
const active = task => !['COMPLETED', 'CANCELLED'].includes(task.status)
async function loadTask(store, id) {
  const task = await store.get('tasks', id)
  check(task, 'TASK_NOT_FOUND', '任务不存在')
  return task
}
async function saveTask(ctx, task, eventType, details = {}) {
  task.updatedAt = ctx.now
  await ctx.store.put('tasks', task.id, task)
  for (const userId of [...new Set([task.ownerId, task.helperId].filter(Boolean))]) {
    const user = await ctx.store.get('users', userId)
    check(user, 'USER_NOT_FOUND', '参与者不存在')
    const ids = new Set(user.activeTaskIds || [])
    if (active(task)) ids.add(task.id)
    else ids.delete(task.id)
    await ctx.store.put('users', user.id, { ...user, activeTaskIds: [...ids], revision: (user.revision || 0) + 1 })
  }
  const eventId = hash(ctx.operationId, task.id, eventType)
  await ctx.store.put('task_events', eventId, {
    taskId: task.id, actorId: ctx.actor.id, actorType: ctx.admin ? 'ADMIN' : 'USER',
    eventType, details, createdAt: ctx.now
  })
}
async function activeParticipants(store, task) {
  for (const id of [task.ownerId, task.helperId].filter(Boolean)) {
    const user = await store.get('users', id)
    check(user && user.status === 'ACTIVE', 'PARTICIPANT_BLOCKED', '参与者账号已停用，请联系管理员处理')
  }
}
module.exports = { active, loadTask, saveTask, activeParticipants }
