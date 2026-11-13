const v = require('../lib/validation')
const { check } = require('../lib/errors')
const m = require('../lib/market')
const orders = require('./product-orders')._helpers
const routes = {
  'admin.products': { async run(ctx, data) {
    const filter = {}, q = m.keyword(data.q)
    if (q) filter.searchText = { $regex: m.literal(q) }
    if (data.visibility && data.visibility !== 'ALL') {
      check(['VISIBLE', 'HIDDEN'].includes(data.visibility), 'INVALID_STATUS', '显示状态无效'); filter.visibility = data.visibility
    }
    if (data.status && data.status !== 'ALL') {
      check(['AVAILABLE', 'RESERVED', 'WITHDRAWN', 'SOLD'].includes(data.status), 'INVALID_STATUS', '商品状态无效'); filter.status = data.status
    }
    const result = await m.page(ctx, 'products', filter, 'newestKey', data)
    return { products: result.items.map(item => ({ ...m.productView(item, ctx.actor.id), moderationReason: item.moderationReason || '' })), nextCursor: result.nextCursor }
  }},
  'admin.productOrders': { async run(ctx, data) {
    const filter = {}
    if (data.status && data.status !== 'ALL') {
      check(['PENDING', 'ACCEPTED', 'CANCEL_PENDING', 'DISPUTED', 'CANCELLED', 'COMPLETED'].includes(data.status), 'INVALID_STATUS', '订单状态无效')
      filter.status = data.status
    }
    const result = await m.page(ctx, 'product_orders', filter, 'newestKey', data)
    return { orders: result.items.map(item => orders.view(item, ctx.actor.id)), nextCursor: result.nextCursor }
  }},
  'admin.hideProduct': {
    write: true, prepare: data => ({ id: v.id(data.id), reason: v.text(data.reason, 2, 300, '下架原因') }),
    async run(ctx, data) {
      const item = await m.product(ctx, data.id)
      item.visibility = 'HIDDEN'; item.moderationReason = data.reason; item.updatedAt = ctx.now
      if (item.status === 'AVAILABLE') item.status = 'WITHDRAWN'
      await ctx.store.put('products', item.id, item)
      const seller = await ctx.store.get('users', item.sellerId)
      await ctx.store.put('users', seller.id, { ...seller, activeProductIds: (seller.activeProductIds || []).filter(id => id !== item.id) })
      // Keep the transaction evidence; existing orders are reviewed independently.
      await m.audit(ctx, 'PRODUCT_HIDDEN', 'PRODUCT', item.id, { reason: data.reason })
      return { id: item.id, visibility: item.visibility }
    }
  },
  'admin.resolveProductOrder': {
    write: true, prepare: data => ({ id: v.id(data.id), cancelled: v.bool(data.cancelled), reason: v.text(data.reason, 2, 300, '处理说明') }),
    async run(ctx, data) {
      const order = await orders.load(ctx, data.id)
      check(['PENDING', 'ACCEPTED', 'CANCEL_PENDING', 'DISPUTED'].includes(order.status), 'INVALID_ORDER_STATE', '订单已经结束')
      if (data.cancelled) await orders.finish(ctx, order, 'CANCELLED')
      else {
        check(order.status === 'DISPUTED', 'INVALID_ORDER_STATE', '只有争议订单可以恢复交易')
        await m.activeSeller(ctx, order.sellerId); await m.activeSeller(ctx, order.buyerId)
        const item = await m.product(ctx, order.productId)
        check(item.visibility === 'VISIBLE', 'PRODUCT_MODERATED', '管理下架的商品不能恢复交易')
        order.status = 'ACCEPTED'; order.cancelRequestedBy = null; order.cancelReason = null
      }
      order.resolution = data.reason; order.updatedAt = ctx.now
      await ctx.store.put('product_orders', order.id, order)
      await m.audit(ctx, 'PRODUCT_ORDER_RESOLVED', 'PRODUCT_ORDER', order.id, { cancelled: data.cancelled, reason: data.reason })
      return { order: orders.view(order, ctx.actor.id) }
    }
  }
}
for (const route of Object.values(routes)) route.admin = true
module.exports = routes
