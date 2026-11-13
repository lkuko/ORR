const v = require('../lib/validation')
const { check } = require('../lib/errors')
const targets = { TASK: 'tasks', POST: 'posts', COMMENT: 'comments', USER: 'users', PRODUCT: 'products' }
module.exports = {
  'reports.mine': { async run(ctx, data = {}) {
    check(!data.view || ['list', 'trash'].includes(data.view), 'INVALID_INPUT', '列表类型无效')
    const trash = data.view === 'trash'
    const filter = { reporterId: ctx.actor.id, reporterArchived: trash ? true : { $ne: true }, createdAt: { $lte: ctx.now } }
    if (trash) filter.reporterArchiveExpiresAt = { $gt: ctx.now }
    if (data.before !== undefined) {
      check(typeof data.before === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.before) && Number.isFinite(Date.parse(data.before)), 'INVALID_INPUT', '记录时间无效')
      filter.createdAt = { $lte: data.before }
    }
    const reports = await ctx.store.list('reports', filter, 'createdAt', 'desc', 100)
    return { snapshotAt: ctx.now, reports: reports.map(report => ({
      id: report.id, targetType: report.targetType, targetId: report.targetId,
      targetSummary: report.targetSummary || '', reason: report.reason,
      status: report.status, resolution: report.resolution || null,
      createdAt: report.createdAt, handledAt: report.handledAt || null,
      archived: report.reporterArchived === true, retentionDays: report.reporterRetentionDays || null,
      archiveExpiresAt: report.reporterArchiveExpiresAt || null
    })) }
  }},
  'reports.archive': {
    write: true,
    prepare(data) {
      check(Array.isArray(data.ids) && data.ids.length > 0 && data.ids.length <= 20, 'INVALID_INPUT', '每次可删除 1 至 20 条记录')
      check([7, 30].includes(data.days), 'INVALID_INPUT', '保留期只能选择 7 天或 30 天')
      return { ids: [...new Set(data.ids.map(v.id))], days: data.days }
    },
    async run(ctx, data) {
      for (const id of data.ids) {
        const report = await ctx.store.get('reports', id)
        check(report && report.reporterId === ctx.actor.id, 'FORBIDDEN', '只能删除自己提交的举报记录')
        if (report.reporterArchived) continue
        await ctx.store.put('reports', id, { ...report, reporterArchived: true, reporterArchivedAt: ctx.now,
          reporterRetentionDays: data.days, reporterArchiveExpiresAt: new Date(Date.parse(ctx.now) + data.days * 86400000).toISOString() })
      }
      return { clearedIds: data.ids }
    }
  },
  'reports.restore': {
    write: true, prepare: data => ({ id: v.id(data.id) }),
    async run(ctx, data) {
      const report = await ctx.store.get('reports', data.id)
      check(report && report.reporterId === ctx.actor.id, 'FORBIDDEN', '只能恢复自己的举报记录')
      check(!report.reporterClearedAt, 'RECORD_CLEARED', '这条记录已清理，无法恢复')
      if (report.reporterArchived) {
        check(report.reporterArchiveExpiresAt > ctx.now, 'ARCHIVE_EXPIRED', '这条记录已超过回收站保留期')
        report.reporterArchived = false
        for (const suffix of ['ArchivedAt', 'ArchiveExpiresAt', 'RetentionDays']) delete report['reporter' + suffix]
        await ctx.store.put('reports', data.id, report)
      }
      return { id: data.id }
    }
  },
  'reports.clear': {
    write: true,
    prepare(data) {
      check(Array.isArray(data.ids) && data.ids.length > 0 && data.ids.length <= 20, 'INVALID_INPUT', '每次可清理 1 至 20 条记录')
      return { ids: [...new Set(data.ids.map(v.id))] }
    },
    async run(ctx, data) {
      for (const id of data.ids) {
        const report = await ctx.store.get('reports', id)
        check(report && report.reporterId === ctx.actor.id, 'FORBIDDEN', '只能清理自己提交的举报记录')
        check(report.reporterArchived === true, 'INVALID_RECORD_STATE', '只能清理回收站内的举报记录')
        if (report.reporterClearedAt) continue
        // Personal visibility never changes the moderation queue or evidence.
        await ctx.store.put('reports', id, { ...report, reporterClearedAt: ctx.now,
          reporterOriginalArchiveExpiresAt: report.reporterArchiveExpiresAt, reporterArchiveExpiresAt: ctx.now })
      }
      return { clearedIds: data.ids }
    }
  },
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
      let visible = ['TASK', 'PRODUCT'].includes(data.targetType) ? target.visibility === 'VISIBLE' : target.status === 'VISIBLE'
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
