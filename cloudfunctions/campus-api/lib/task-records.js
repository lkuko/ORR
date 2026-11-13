const { check } = require('./errors')
const { hash } = require('./validation')
const active = task => !['COMPLETED', 'CANCELLED'].includes(task.status)
const taskRole = (task, actorId) => task.ownerId === actorId ? 'owner' : 'helper'
function assertRecordAccess(ctx, task) {
  if (ctx.admin || ![task.ownerId, task.helperId].includes(ctx.actor.id)) return
  const role = taskRole(task, ctx.actor.id)
  check(!task[role + 'ClearedAt'], 'RECORD_CLEARED', '这条记录已清理，无法恢复')
  check(!task[role + 'Archived'] || task[role + 'ArchiveExpiresAt'] > ctx.now,
    'ARCHIVE_EXPIRED', '这条记录已超过回收站保留期')
}
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
module.exports = { active, loadTask, saveTask, activeParticipants, taskRole, assertRecordAccess }
