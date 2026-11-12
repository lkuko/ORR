const v = require('../lib/validation')
const { check } = require('../lib/errors')
const { participant, messageView } = require('../lib/views')
const { loadTask, activeParticipants } = require('../lib/task-records')
module.exports = {
  'messages.list': { async run(ctx, data) {
    const task = await loadTask(ctx.store, v.id(data.id))
    check(participant(task, ctx.actor.id), 'FORBIDDEN', '只有订单双方可以查看留言')
    return { messages: (await ctx.store.list('task_messages', { taskId: task.id }, 'createdAt', 'desc', 200)).reverse().map(messageView) }
  }},
  'messages.send': {
    write: true,
    prepare: data => ({ id: v.id(data.id), content: v.text(data.content, 1, 500, '留言') }),
    content: data => data.content,
    async run(ctx, data) {
      const task = await loadTask(ctx.store, data.id)
      check(participant(task, ctx.actor.id), 'FORBIDDEN', '只有订单双方可以留言')
      check(!['COMPLETED', 'CANCELLED'].includes(task.status), 'TASK_CLOSED', '已结束的订单不能继续留言')
      await activeParticipants(ctx.store, task)
      // Touch task to serialize message writes with closure/moderation.
      await ctx.store.put('tasks', task.id, { ...task, messageRevision: (task.messageRevision || 0) + 1 })
      const message = { id: v.hash('message', ctx.operationId), taskId: task.id, senderId: ctx.actor.id,
        senderNickname: ctx.actor.nickname, content: data.content, createdAt: ctx.now }
      await ctx.store.put('task_messages', message.id, message)
      return { message: messageView(message) }
    }
  }
}
