const v = require('./validation')
const { check } = require('./errors')
const CATEGORIES = ['BOOKS', 'DIGITAL', 'DAILY', 'SPORTS', 'CLOTHING', 'OTHER']
const CONDITIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']
const favoriteId = (user, product) => v.hash('favorite', user, product)
const newestKey = item => item.createdAt + '_' + item.id
function rankKey(item) {
  // Subtracting the current time would subtract the same constant from every item.
  const score = Date.parse(item.createdAt) / 3600000 + 72 * Math.log2(1 + item.favoriteCount)
  return String(Math.round(score * 1000000)).padStart(16, '0') + '_' + item.id
}
function productView(item, actorId, favorite = false) {
  return {
    id: item.id, title: item.title, description: item.description, category: item.category,
    condition: item.condition, price: v.amount(item.priceCents), publicArea: item.publicArea,
    sellerId: item.sellerId, sellerNickname: item.sellerNickname, isSeller: item.sellerId === actorId,
    imageIds: item.imageIds, favoriteCount: item.favoriteCount, favorited: favorite,
    status: item.status, visibility: item.visibility, createdAt: item.createdAt, updatedAt: item.updatedAt,
    moderationReason: item.sellerId === actorId ? item.moderationReason || '' : ''
  }
}
async function product(ctx, id, ownHidden = false) {
  const item = await ctx.store.get('products', v.id(id))
  check(item && (ctx.admin || (item.visibility === 'VISIBLE' && item.status !== 'WITHDRAWN') || (ownHidden && item.sellerId === ctx.actor.id)),
    'PRODUCT_NOT_FOUND', '商品不存在或已下架')
  return item
}
function literal(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function keyword(value) {
  check(value === undefined || typeof value === 'string', 'INVALID_INPUT', '关键词格式不正确')
  const q = (value || '').trim().toLowerCase()
  check(q.length <= 60, 'INVALID_INPUT', '关键词最多 60 个字符')
  return q
}
async function page(ctx, collection, filter, order, input = {}, scope = '', liveFilter = {}, snapshotCreatedAt = true) {
  const size = input.pageSize === undefined ? 20 : input.pageSize
  check(Number.isInteger(size) && size >= 1 && size <= 40, 'INVALID_INPUT', '分页数量无效')
  const signature = v.hash(collection, order, v.canonical(filter), scope)
  let after = '', asOf = ctx.now
  if (input.cursor) {
    let cursor
    try {
      check(typeof input.cursor === 'string' && input.cursor.length <= 1200, 'INVALID_CURSOR', '分页信息无效，请刷新')
      cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString())
    } catch (_) { check(false, 'INVALID_CURSOR', '分页信息无效，请刷新') }
    check(cursor.signature === signature && typeof cursor.after === 'string' && cursor.after.length < 150 &&
      typeof cursor.asOf === 'string' && !Number.isNaN(Date.parse(cursor.asOf)) && cursor.asOf <= ctx.now,
    'INVALID_CURSOR', '筛选已变更，请刷新列表')
    after = cursor.after; asOf = cursor.asOf
  }
  // Server-owned time predicates are evaluated on every page without changing
  // the filter signature. Expired trash must disappear even during pagination.
  const where = { ...filter, ...liveFilter, ...(snapshotCreatedAt ? { createdAt: { $lte: asOf } } : {}) }
  if (after) where[order] = { $lt: after }
  const rows = await ctx.store.list(collection, where, order, 'desc', size + 1)
  const items = rows.slice(0, size)
  const nextCursor = rows.length > size ? Buffer.from(JSON.stringify({ signature, asOf, after: items.at(-1)[order] })).toString('base64url') : ''
  return { items, nextCursor }
}
async function activeSeller(ctx, sellerId) {
  const seller = await ctx.store.get('users', sellerId)
  check(seller?.status === 'ACTIVE', 'PARTICIPANT_BLOCKED', '交易方账号不可用，请联系管理员')
  // A write participates in conflict detection with admin account blocking.
  await ctx.store.put('users', seller.id, { ...seller, revision: (seller.revision || 0) + 1 })
}
async function audit(ctx, action, targetType, targetId, details) {
  await ctx.store.put('admin_action_logs', v.hash('audit', ctx.operationId), {
    adminId: ctx.actor.id, adminUsername: ctx.actor.username, action, targetType, targetId, details, createdAt: ctx.now
  })
}
module.exports = { CATEGORIES, CONDITIONS, favoriteId, newestKey, rankKey, productView, product, literal, keyword, page, activeSeller, audit }
