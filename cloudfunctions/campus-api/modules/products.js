const v = require('../lib/validation')
const { check } = require('../lib/errors')
const m = require('../lib/market')
const { approvedAsset } = require('../lib/media')
function prepare(data) {
  check(m.CATEGORIES.includes(data.category), 'INVALID_CATEGORY', '请选择商品分类')
  check(m.CONDITIONS.includes(data.condition), 'INVALID_CONDITION', '请选择商品成色')
  const priceCents = v.money(data.price)
  check(priceCents !== null && priceCents >= 1 && priceCents <= 9999999, 'INVALID_PRICE', '价格需在 0.01–99999.99 元之间')
  check(Array.isArray(data.imageIds) && data.imageIds.length >= 1 && data.imageIds.length <= 6 && new Set(data.imageIds).size === data.imageIds.length,
    'INVALID_IMAGES', '请添加 1–6 张不同的商品照片')
  return { title: v.text(data.title, 2, 60, '商品标题'), description: v.text(data.description, 2, 2000, '商品描述'),
    category: data.category, condition: data.condition, priceCents, publicArea: v.text(data.publicArea, 1, 80, '交易区域'), imageIds: data.imageIds.map(v.id) }
}
module.exports = {
  'products.list': { async run(ctx, data) {
    const filter = { status: 'AVAILABLE', visibility: 'VISIBLE' }, q = m.keyword(data.q)
    if (data.category && data.category !== 'ALL') {
      check(m.CATEGORIES.includes(data.category), 'INVALID_CATEGORY', '商品分类无效'); filter.category = data.category
    }
    if (q) filter.searchText = { $regex: m.literal(q) }
    check(!data.sort || ['newest', 'recommended'].includes(data.sort), 'INVALID_SORT', '排序方式无效')
    const result = await m.page(ctx, 'products', filter, data.sort === 'newest' ? 'newestKey' : 'rankKey', data)
    const ids = result.items.map(item => item.id)
    const favorites = ids.length ? await ctx.store.list('favorites', { userId: ctx.actor.id, active: true, productId: { $in: ids } }, 'productId', 'asc', ids.length) : []
    const favoriteProducts = new Set(favorites.map(item => item.productId))
    return { products: result.items.map(item => m.productView(item, ctx.actor.id, favoriteProducts.has(item.id))), nextCursor: result.nextCursor }
  }},
  'products.get': { async run(ctx, data) {
    const item = await m.product(ctx, data.id, true)
    return { product: m.productView(item, ctx.actor.id, !!(await ctx.store.get('favorites', m.favoriteId(ctx.actor.id, item.id)))?.active) }
  }},
  'products.create': {
    write: true, prepare, content: data => [data.title, data.description, data.publicArea].join('\n'), scene: 3,
    async run(ctx, data) {
      const active = ctx.actor.activeProductIds || []
      check(active.length < 50, 'LISTING_LIMIT', '最多同时发布 50 件商品，请先下架部分商品')
      const item = { ...data, id: v.hash('product', ctx.operationId), sellerId: ctx.actor.id, sellerNickname: ctx.actor.nickname,
        status: 'AVAILABLE', visibility: 'VISIBLE', favoriteCount: 0, activeOrderId: null, createdAt: ctx.now, updatedAt: ctx.now }
      for (const id of item.imageIds) {
        const asset = await approvedAsset(ctx.store, id)
        check(asset.ownerId === ctx.actor.id && !asset.productId, 'INVALID_IMAGES', '只能使用本人上传且未绑定的图片')
        await ctx.store.put('media_assets', id, { ...asset, productId: item.id })
      }
      item.searchText = (item.title + '\n' + item.description).toLowerCase()
      item.rankKey = m.rankKey(item); item.newestKey = m.newestKey(item)
      await ctx.store.put('products', item.id, item)
      await ctx.store.put('users', ctx.actor.id, { ...ctx.actor, activeProductIds: [...active, item.id] })
      return { product: m.productView(item, ctx.actor.id) }
    }
  },
  'products.mine': { async run(ctx, data) {
    const filter = { sellerId: ctx.actor.id }
    if (data.status && data.status !== 'ALL') {
      check(['AVAILABLE', 'RESERVED', 'SOLD', 'WITHDRAWN'].includes(data.status), 'INVALID_STATUS', '商品状态无效'); filter.status = data.status
    }
    const result = await m.page(ctx, 'products', filter, 'newestKey', data, ctx.actor.id)
    return { products: result.items.map(item => m.productView(item, ctx.actor.id)), nextCursor: result.nextCursor }
  }},
  'products.setStatus': {
    write: true, prepare: data => ({ id: v.id(data.id), available: v.bool(data.available) }),
    async run(ctx, data) {
      const item = await m.product(ctx, data.id, true)
      check(item.sellerId === ctx.actor.id, 'FORBIDDEN', '只能管理自己发布的商品')
      check(item.visibility === 'VISIBLE', 'PRODUCT_MODERATED', '商品已被管理下架，不能自行重新上架')
      check(['AVAILABLE', 'WITHDRAWN'].includes(item.status), 'INVALID_PRODUCT_STATE', '预约中或已售出的商品不能上下架')
      const active = (ctx.actor.activeProductIds || []).filter(id => id !== item.id)
      if (data.available) { check(active.length < 50, 'LISTING_LIMIT', '最多同时发布 50 件商品'); active.push(item.id) }
      item.status = data.available ? 'AVAILABLE' : 'WITHDRAWN'; item.updatedAt = ctx.now
      await ctx.store.put('products', item.id, item)
      await ctx.store.put('users', ctx.actor.id, { ...ctx.actor, activeProductIds: active })
      return { product: m.productView(item, ctx.actor.id) }
    }
  },
  'favorites.set': {
    write: true, prepare: data => ({ id: v.id(data.id), active: v.bool(data.active) }),
    async run(ctx, data) {
      const item = await ctx.store.get('products', data.id)
      check(item, 'PRODUCT_NOT_FOUND', '商品不存在')
      const id = m.favoriteId(ctx.actor.id, item.id), previous = await ctx.store.get('favorites', id)
      if (data.active) {
        check(item.sellerId !== ctx.actor.id, 'OWN_PRODUCT', '无需收藏自己的商品')
        check(item.visibility === 'VISIBLE' && item.status !== 'WITHDRAWN', 'PRODUCT_NOT_FOUND', '商品已下架')
      }
      if (!!previous?.active !== data.active) {
        item.favoriteCount = Math.max(0, item.favoriteCount + (data.active ? 1 : -1))
        item.rankKey = m.rankKey(item)
        await ctx.store.put('products', item.id, item)
        const record = { id, userId: ctx.actor.id, productId: item.id, active: data.active, createdAt: ctx.now }
        record.newestKey = m.newestKey(record)
        await ctx.store.put('favorites', id, record)
      }
      return { productId: item.id, active: data.active, favoriteCount: item.favoriteCount }
    }
  },
  'favorites.list': { async run(ctx, data) {
    const result = await m.page(ctx, 'favorites', { userId: ctx.actor.id, active: true }, 'newestKey', data, ctx.actor.id)
    return { products: await Promise.all(result.items.map(async record => {
      const item = await ctx.store.get('products', record.productId)
      return item && item.visibility === 'VISIBLE' && item.status !== 'WITHDRAWN' ? m.productView(item, ctx.actor.id, true)
        : { id: record.productId, unavailable: true, title: '商品已下架', favorited: true, imageIds: [] }
    })), nextCursor: result.nextCursor }
  }}
}
