const v = require('../lib/validation')
const { check } = require('../lib/errors')
const targets = { TASK: 'tasks', POST: 'posts', COMMENT: 'comments', USER: 'users' }
module.exports = {
  'reports.mine': { async run(ctx) {
    const reports = await ctx.store.list('reports', { reporterId: ctx.actor.id }, 'createdAt', 'desc', 100)
    return { reports: reports.map(report => ({
      id: report.id, targetType: report.targetType, targetId: report.targetId,
      targetSummary: report.targetSummary || '', reason: report.reason,
      status: report.status, resolution: report.resolution || null,
      createdAt: report.createdAt, handledAt: report.handledAt || null
    })) }
  }},
  'reports.create': {
    write: true,
    prepare(data) {
      check(Object.hasOwn(targets, data.targetType), 'INVALID_TARGET', '举报对象无效')
      return { targetType: data.targetType, targetId: v.id(data.targetId), reason: v.text(data.reason, 2, 500, '举报原因') }
    },
    content: data => data.reason,
    async run(ctx, data) {
      const target = await ctx.store.get(targets[data.targetType], data.targetId)
      check(target, 'TARGET_NOT_FOUND', '举报对象不存在')
      // Keep only the public context visible when the report was submitted.
      // Historical reports without this snapshot remain readable without reopening hidden content.
      let visible = data.targetType === 'TASK' ? target.visibility === 'VISIBLE' : target.status === 'VISIBLE'
      if (data.targetType === 'COMMENT') {
        const post = await ctx.store.get('posts', target.postId)
        visible = visible && post?.status === 'VISIBLE'
      }
      if (data.targetType === 'USER') visible = target.status === 'ACTIVE'
      const targetSummary = visible ? String(target.title || target.content || target.nickname || '').slice(0, 160) : ''
      const report = { ...data, id: v.hash('report', ctx.operationId), reporterId: ctx.actor.id,
        reporterNickname: ctx.actor.nickname, targetSummary, status: 'OPEN', resolution: null, handledAt: null, createdAt: ctx.now }
      await ctx.store.put('reports', report.id, report)
      return { id: report.id, status: report.status }
    }
  }
}
