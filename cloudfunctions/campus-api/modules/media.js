const v = require('../lib/validation')
const { check } = require('../lib/errors')
const { decodeImage, status, approvedAsset } = require('../lib/media')
function descriptor(asset, state) { return { id: asset.id, status: state, createdAt: asset.createdAt } }
async function urls(ctx, data) {
  check(Array.isArray(data.productIds) && data.productIds.length <= 40, 'INVALID_INPUT', '图片查询数量过多')
  const output = {}, batches = [], fileIds = []
  // The server chooses file IDs. Never sign arbitrary client-supplied storage paths.
  for (const id of [...new Set(data.productIds.map(v.id))]) {
    const item = await ctx.store.get('products', id)
    if (!item || (!ctx.admin && (item.visibility !== 'VISIBLE' || (item.status === 'WITHDRAWN' && item.sellerId !== ctx.actor.id)))) continue
    const files = []
    for (const imageId of item.imageIds) {
      try { files.push((await approvedAsset(ctx.store, imageId)).fileId) } catch (_) {}
    }
    batches.push({ id, count: files.length })
    fileIds.push(...files)
  }
  const signed = fileIds.length ? await ctx.media.urls(fileIds) : []
  let offset = 0
  for (const batch of batches) {
    output[batch.id] = signed.slice(offset, offset + batch.count)
    offset += batch.count
  }
  return { urls: output }
}
module.exports = {
  'media.upload': {
    write: true, prepare: decodeImage,
    async preflight(ctx, data) {
      const id = v.hash('media', ctx.operationId), day = ctx.now.slice(0, 10)
      const asset = await ctx.store.transact(async tx => {
        const old = await tx.get('media_assets', id)
        if (old) {
          check(old.ownerId === ctx.actor.id && old.contentHash === data.contentHash, 'IDEMPOTENCY_CONFLICT', '图片请求标识冲突')
          return old
        }
        const user = await tx.get('users', ctx.actor.id)
        check(user?.status === 'ACTIVE', 'ACCOUNT_UNAVAILABLE', '账号不可用')
        const count = user.mediaDay === day ? user.mediaCount || 0 : 0
        check(count < 60, 'UPLOAD_LIMIT', '今日最多上传 60 张图片，请明天再试')
        await tx.put('users', user.id, { ...user, mediaDay: day, mediaCount: count + 1, revision: (user.revision || 0) + 1 })
        const item = { id, ownerId: user.id, contentHash: data.contentHash, createdAt: ctx.now, attempts: 1, productId: null }
        await tx.put('media_assets', id, item)
        return item
      })
      if (asset.traceId) return { asset }
      check(ctx.media, 'CONFIGURATION_ERROR', '图片服务未配置')
      const uploaded = await ctx.media.upload(id, data, ctx.actor.openid)
      return { asset: { ...asset, ...uploaded, submittedAt: ctx.now } }
    },
    async run(ctx, data) {
      // A retried upload reuses the immutable path/content and preserves its first trace.
      const existing = await ctx.store.get('media_assets', data.asset.id)
      const asset = existing?.traceId ? existing : data.asset
      await ctx.store.put('media_assets', asset.id, asset)
      return { media: descriptor(asset, await status(ctx.store, asset, ctx.now)) }
    }
  },
  'media.status': { async run(ctx, data) {
    check(Array.isArray(data.ids) && data.ids.length <= 6, 'INVALID_INPUT', '一次最多查询 6 张图片')
    const media = []
    for (const id of data.ids.map(v.id)) {
      const asset = await ctx.store.get('media_assets', id)
      check(asset?.ownerId === ctx.actor.id, 'FORBIDDEN', '只能读取自己上传图片的状态')
      media.push(descriptor(asset, await status(ctx.store, asset, ctx.now)))
    }
    return { media }
  }},
  'media.retry': {
    write: true, prepare: data => ({ id: v.id(data.id) }),
    async preflight(ctx, data) {
      const asset = await ctx.store.get('media_assets', data.id)
      check(asset?.ownerId === ctx.actor.id && !asset.productId, 'FORBIDDEN', '无法重新检查该图片')
      check(await status(ctx.store, asset, ctx.now) === 'ERROR' && asset.attempts < 3, 'INVALID_MEDIA_STATE', '仅可重试检查异常的图片，每张最多三次')
      return { id: asset.id, oldTrace: asset.traceId, ...await ctx.media.check(asset.fileId, ctx.actor.openid) }
    },
    async run(ctx, data) {
      const asset = await ctx.store.get('media_assets', data.id)
      check(!asset.productId && asset.traceId === data.oldTrace, 'MEDIA_CHANGED', '图片检查状态已变化，请刷新')
      asset.traceId = data.traceId; asset.attempts++; asset.submittedAt = ctx.now
      await ctx.store.put('media_assets', asset.id, asset)
      return { media: descriptor(asset, 'PENDING') }
    }
  },
  'media.urls': { run: urls },
  'admin.mediaUrls': { admin: true, run: urls }
}
