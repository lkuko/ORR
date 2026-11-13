const v = require('../lib/validation')
const { check } = require('../lib/errors')
const { participant, taskView } = require('../lib/views')
const { taskRole, assertRecordAccess } = require('../lib/task-records')
const ENDED = ['COMPLETED', 'CANCELLED']
function ids(data) {
  check(Array.isArray(data.ids) && data.ids.length > 0 && data.ids.length <= 20, 'INVALID_INPUT', '每次可整理 1 至 20 条记录')
  return [...new Set(data.ids.map(v.id))]
}
async function ownedTask(ctx, id) {
  const task = await ctx.store.get('tasks', id)
  check(task && participant(task, ctx.actor.id), 'FORBIDDEN', '只能整理自己的跑腿订单记录')
  check(ENDED.includes(task.status), 'INVALID_TASK_STATE', '只能整理已完成或已取消的跑腿订单')
  return task
}
module.exports = {
  'tasks.archive': {
    write: true, prepare(data) {
      check([7, 30].includes(data.days), 'INVALID_INPUT', '保留期只能选择 7 天或 30 天')
      return { ids: ids(data), days: data.days }
    },
    async run(ctx, data) {
      for (const id of data.ids) {
        const task = await ownedTask(ctx, id), role = taskRole(task, ctx.actor.id)
        assertRecordAccess(ctx, task)
        if (task[role + 'Archived']) continue
        Object.assign(task, { [role + 'Archived']: true, [role + 'ArchivedAt']: ctx.now,
          [role + 'ArchiveExpiresAt']: new Date(Date.parse(ctx.now) + data.days * 86400000).toISOString(), [role + 'RetentionDays']: data.days })
        // Personal organization never changes task status, business timestamps or the other participant.
        await ctx.store.put('tasks', id, task)
      }
      return { clearedIds: data.ids }
    }
  },
  'tasks.restore': {
    write: true, prepare: data => ({ id: v.id(data.id) }),
    async run(ctx, data) {
      const task = await ownedTask(ctx, data.id), role = taskRole(task, ctx.actor.id)
      assertRecordAccess(ctx, task)
      if (task[role + 'Archived']) {
        task[role + 'Archived'] = false
        for (const suffix of ['ArchivedAt', 'ArchiveExpiresAt', 'RetentionDays']) delete task[role + suffix]
        await ctx.store.put('tasks', task.id, task)
      }
      return { task: taskView(task, ctx.actor.id) }
    }
  },
  'tasks.clear': {
    write: true, prepare: data => ({ ids: ids(data) }),
    async run(ctx, data) {
      for (const id of data.ids) {
        const task = await ownedTask(ctx, id), role = taskRole(task, ctx.actor.id)
        check(task[role + 'Archived'] === true, 'INVALID_RECORD_STATE', '只能清理回收站内的记录')
        if (task[role + 'ClearedAt']) continue
        Object.assign(task, { [role + 'OriginalArchiveExpiresAt']: task[role + 'ArchiveExpiresAt'],
          [role + 'ArchiveExpiresAt']: ctx.now, [role + 'ClearedAt']: ctx.now })
        await ctx.store.put('tasks', id, task)
      }
      return { clearedIds: data.ids }
    }
  }
}
