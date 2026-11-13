const v = require('../lib/validation')
const { check } = require('../lib/errors')
const { userView } = require('../lib/views')
const { loadTask, saveTask, activeParticipants } = require('../lib/task-records')
const targets = { TASK: 'tasks', POST: 'posts', COMMENT: 'comments', USER: 'users', PRODUCT: 'products' }
async function audit(ctx, action, targetType, targetId, details) {
  await ctx.store.put('admin_action_logs', v.hash('audit', ctx.operationId), {
    adminId: ctx.actor.id, adminUsername: ctx.actor.username, action, targetType, targetId, details, createdAt: ctx.now
  })
}
const routes = {
  'admin.session': { async run(ctx) { return { admin: { id: ctx.actor.id, username: ctx.actor.username } } }},
  'admin.reports': { async run(ctx, data) {
    const status = ['OPEN', 'RESOLVED', 'DISMISSED'].includes(data.status) ? data.status : 'OPEN'
    return { reports: await ctx.store.list('reports', { status }, 'createdAt', 'asc', 200) }
  }},
  'admin.content': { async run(ctx, data) {
    check(Object.hasOwn(targets, data.type), 'INVALID_TARGET', '内容类型无效')
    const item = await ctx.store.get(targets[data.type], v.id(data.id))
    check(item, 'TARGET_NOT_FOUND', '内容不存在')
    return { content: {
      id: item.id, authorId: item.authorId || item.ownerId || item.sellerId || item.id,
      content: item.content || item.description || item.nickname, title: item.title || null,
      publicArea: item.publicArea || null, status: item.status, visibility: item.visibility || null
    } }
  }},
  'admin.cancellations': { async run(ctx) {
    const tasks = await ctx.store.list('tasks', { status: 'CANCEL_DISPUTED' }, 'updatedAt', 'asc')
    return { tasks: tasks.map(task => ({
      id: task.id, title: task.title, status: task.status, cancelReason: task.cancelReason,
      cancelRequestedBy: task.cancelRequestedBy, resumeStatus: task.cancelResumeStatus,
      ownerNickname: task.ownerNickname, helperNickname: task.helperNickname, publicArea: task.publicArea, createdAt: task.createdAt
    })) }
  }},
  'admin.resolveCancellation': {
    write: true, prepare: data => ({ id: v.id(data.id), cancelled: v.bool(data.cancelled), reason: v.text(data.reason, 2, 300, '处理说明') }),
    async run(ctx, data) {
      const task = await loadTask(ctx.store, data.id)
      check(task.status === 'CANCEL_DISPUTED', 'INVALID_TASK_STATE', '任务没有待管理员处理的取消争议')
      if (!data.cancelled) {
        await activeParticipants(ctx.store, task)
        check(['ASSIGNED', 'COMPLETION_PENDING'].includes(task.cancelResumeStatus), 'INVALID_TASK_STATE', '任务恢复状态异常')
      }
      task.status = data.cancelled ? 'CANCELLED' : task.cancelResumeStatus
      task.cancelRequestedBy = null; task.cancelReason = null; task.cancelResumeStatus = null
      await saveTask(ctx, task, 'ADMIN_CANCELLATION_RESOLVED', { reason: data.reason, status: task.status })
      await audit(ctx, 'CANCELLATION_RESOLVED', 'TASK', task.id, { cancelled: data.cancelled, reason: data.reason })
      return { taskId: task.id, status: task.status }
    }
  },
  'admin.resolveReport': {
    write: true,
    prepare(data) {
      check(['RESOLVED', 'DISMISSED'].includes(data.status), 'INVALID_RESOLUTION', '处理结果无效')
      return { id: v.id(data.id), status: data.status, resolution: v.text(data.resolution, 2, 300, '处理说明') }
    },
    async run(ctx, data) {
      const report = await ctx.store.get('reports', data.id)
      check(report, 'REPORT_NOT_FOUND', '举报不存在')
      check(report.status === 'OPEN', 'REPORT_ALREADY_HANDLED', '举报已处理')
      await ctx.store.put('reports', report.id, { ...report, status: data.status, resolution: data.resolution, handledBy: ctx.actor.id, handledAt: ctx.now })
      await audit(ctx, 'REPORT_RESOLVED', 'REPORT', report.id, { status: data.status, resolution: data.resolution })
      return { id: report.id, status: data.status }
    }
  },
  'admin.hide': {
    write: true,
    prepare(data) {
      check(['TASK', 'POST', 'COMMENT', 'PRODUCT'].includes(data.type), 'INVALID_TARGET', '下架对象无效')
      return { type: data.type, id: v.id(data.id), reason: v.text(data.reason, 2, 300, '下架原因') }
    },
    async run(ctx, data) {
      if (data.type === 'PRODUCT') return require('./market-admin')['admin.hideProduct'].run(ctx, data)
      const item = await ctx.store.get(targets[data.type], data.id)
      check(item, 'TARGET_NOT_FOUND', '内容不存在')
      if (data.type === 'TASK') {
        item.visibility = 'HIDDEN'
        if (!['COMPLETED', 'CANCELLED'].includes(item.status)) item.status = 'CANCELLED'
        await saveTask(ctx, item, 'MODERATED', { reason: data.reason })
      } else {
        if (data.type === 'COMMENT' && item.status === 'VISIBLE') {
          const post = await ctx.store.get('posts', item.postId)
          if (post) await ctx.store.put('posts', post.id, { ...post, commentCount: Math.max(0, post.commentCount - 1) })
        }
        item.status = 'HIDDEN'
        await ctx.store.put(targets[data.type], item.id, item)
      }
      await audit(ctx, 'CONTENT_HIDDEN', data.type, item.id, { reason: data.reason })
      return { targetType: data.type, targetId: item.id, status: item.status }
    }
  },
  'admin.users': { async run(ctx, data) {
    const term = String(data.q || '').trim().slice(0, 60)
    const users = await ctx.store.list('users')
    return { users: users.filter(user => user.nickname.includes(term)).map(userView) }
  }},
  'admin.setUserStatus': {
    write: true,
    prepare(data) {
      check(['ACTIVE', 'BLOCKED'].includes(data.status), 'INVALID_STATUS', '账号状态无效')
      return { id: v.id(data.id), status: data.status, reason: v.text(data.reason, 2, 300, '处理说明') }
    },
    async run(ctx, data) {
      const user = await ctx.store.get('users', data.id)
      check(user, 'USER_NOT_FOUND', '用户不存在')
      await ctx.store.put('users', user.id, { ...user, status: data.status, revision: (user.revision || 0) + 1 })
      // Maintained atomically by every task transition; no transaction where-query.
      if (data.status === 'BLOCKED' && user.status !== 'BLOCKED') {
        for (const id of user.activeProductIds || []) {
          const item = await ctx.store.get('products', id)
          if (!item) continue
          await ctx.store.put('products', id, { ...item, visibility: 'HIDDEN',
            status: item.status === 'AVAILABLE' ? 'WITHDRAWN' : item.status,
            moderationReason: '卖家账号已停用：' + data.reason, updatedAt: ctx.now })
        }
        for (const id of user.activeTaskIds || []) {
          const task = await loadTask(ctx.store, id)
          if (!['OPEN', 'ASSIGNED', 'COMPLETION_PENDING', 'CANCEL_PENDING'].includes(task.status)) continue
          const previousStatus = task.status, previousCancelReason = task.cancelReason
          task.visibility = 'HIDDEN'
          if (task.status === 'OPEN') task.status = 'CANCELLED'
          else {
            task.cancelResumeStatus = task.status === 'CANCEL_PENDING' ? task.cancelResumeStatus : task.status
            task.status = 'CANCEL_DISPUTED'; task.cancelRequestedBy = user.id
            task.cancelReason = ('账号封禁，需管理员处理：' + data.reason).slice(0, 300)
          }
          await saveTask(ctx, task, 'ADMIN_USER_BLOCKED', { userId: user.id, reason: data.reason, previousStatus, previousCancelReason })
        }
      }
      await audit(ctx, data.status === 'BLOCKED' ? 'USER_BLOCKED' : 'USER_RESTORED', 'USER', user.id, { reason: data.reason })
      return { userId: user.id, status: data.status }
    }
  },
  'admin.actions': { async run(ctx) { return { actions: await ctx.store.list('admin_action_logs') } }}
}
for (const route of Object.values(routes)) route.admin = true
module.exports = routes
