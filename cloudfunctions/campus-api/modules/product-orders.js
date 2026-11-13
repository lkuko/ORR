const v = require('../lib/validation')
const { check } = require('../lib/errors')
const m = require('../lib/market')
const OPEN = ['PENDING', 'ACCEPTED', 'CANCEL_PENDING', 'DISPUTED']
const ENDED = ['COMPLETED', 'CANCELLED']
const roleOf = (order, actorId) => order.sellerId === actorId ? 'seller' : 'buyer'
async function load(ctx, id) {
  const order = await ctx.store.get('product_orders', v.id(id))
  check(order, 'ORDER_NOT_FOUND', '交易订单不存在')
  check(ctx.admin || [order.sellerId, order.buyerId].includes(ctx.actor.id), 'FORBIDDEN', '仅交易双方可查看此订单')
  const role = roleOf(order, ctx.actor.id)
  check(ctx.admin || !order[role + 'ClearedAt'], 'RECORD_CLEARED', '这条记录已清理，无法恢复')
  check(ctx.admin || !order[role + 'Archived'] || order[role + 'ArchiveExpiresAt'] > ctx.now,
    'ARCHIVE_EXPIRED', '这条记录已超过回收站保留期')
  return order
}
function view(order, actorId) {
  const { id, productId, title, priceCents, publicArea, sellerId, sellerNickname, buyerId, buyerNickname,
    status, cancelRequestedBy, cancelReason, resolution, createdAt, updatedAt } = order
  const role = roleOf(order, actorId), participant = [sellerId, buyerId].includes(actorId)
  const archived = participant && order[role + 'Archived'] === true
  return { id, productId, title, price: v.amount(priceCents), publicArea, sellerId, sellerNickname, buyerId, buyerNickname,
    status, cancelRequestedBy, cancelReason, resolution, createdAt, updatedAt, isSeller: sellerId === actorId, isBuyer: buyerId === actorId,
    archived, ...(archived ? { archivedAt: order[role + 'ArchivedAt'], archiveExpiresAt: order[role + 'ArchiveExpiresAt'], retentionDays: order[role + 'RetentionDays'] } : {}) }
}
async function messages(ctx, data) {
  const result = await m.page(ctx, 'product_messages', { orderId: data.id }, 'newestKey', data, ctx.actor.id)
  return { messages: result.items.map(({ id, senderId, senderNickname, content, createdAt }) => ({ id, senderId, senderNickname, content, createdAt })), nextCursor: result.nextCursor }
}
async function finish(ctx, order, status) {
  const item = await ctx.store.get('products', order.productId)
  check(item && item.activeOrderId === order.id, 'INVALID_PRODUCT_STATE', '商品与订单状态不一致，请联系管理员')
  order.status = status
  item.status = status === 'COMPLETED' ? 'SOLD' : item.visibility === 'VISIBLE' ? 'AVAILABLE' : 'WITHDRAWN'
  item.activeOrderId = null; item.updatedAt = ctx.now
  await ctx.store.put('products', item.id, item)
  if (item.status !== 'AVAILABLE') {
    const seller = await ctx.store.get('users', item.sellerId)
    await ctx.store.put('users', seller.id, { ...seller, activeProductIds: (seller.activeProductIds || []).filter(id => id !== item.id) })
  }
}
const routes = {
  'productOrders.create': {
    write: true, prepare: data => ({ productId: v.id(data.productId) }),
    async run(ctx, data) {
      const item = await m.product(ctx, data.productId)
      check(item.sellerId !== ctx.actor.id, 'OWN_PRODUCT', '不能预约自己的商品')
      check(item.status === 'AVAILABLE' && !item.activeOrderId, 'PRODUCT_UNAVAILABLE', '商品已被预约、售出或下架')
      await m.activeSeller(ctx, item.sellerId)
      const order = { id: v.hash('product-order', ctx.operationId), productId: item.id, title: item.title,
        priceCents: item.priceCents, publicArea: item.publicArea, sellerId: item.sellerId, sellerNickname: item.sellerNickname,
        buyerId: ctx.actor.id, buyerNickname: ctx.actor.nickname, status: 'ACCEPTED', cancelRequestedBy: null, cancelReason: null,
        resolution: null, createdAt: ctx.now, updatedAt: ctx.now }
      order.newestKey = m.newestKey(order)
      await ctx.store.put('products', item.id, { ...item, status: 'RESERVED', activeOrderId: order.id, updatedAt: ctx.now })
      await ctx.store.put('product_orders', order.id, order)
      return { order: view(order, ctx.actor.id) }
    }
  },
  'productOrders.get': { async run(ctx, data) {
    const order = await load(ctx, data.id)
    const history = data.includeMessages === true ? await messages(ctx, { id: order.id, pageSize: 40 }) : {}
    return { order: view(order, ctx.actor.id), ...history }
  }},
  'productOrders.mine': { async run(ctx, data) {
    check(!data.role || ['seller', 'buyer'].includes(data.role), 'INVALID_INPUT', '订单角色无效')
    check(!data.view || ['list', 'trash'].includes(data.view), 'INVALID_INPUT', '列表类型无效')
    check(!data.status || ['all', 'active', 'ended'].includes(data.status), 'INVALID_INPUT', '订单状态无效')
    const role = data.role === 'seller' ? 'seller' : 'buyer', trash = data.view === 'trash'
    const filter = { [role + 'Id']: ctx.actor.id, [role + 'Archived']: trash ? true : { $ne: true } }
    if (data.status === 'active') filter.status = { $in: OPEN }
    else if (data.status === 'ended') filter.status = { $in: ['CANCELLED', 'COMPLETED'] }
    const result = await m.page(ctx, 'product_orders', filter, trash ? role + 'ArchiveKey' : 'newestKey', data, ctx.actor.id,
      trash ? { [role + 'ArchiveExpiresAt']: { $gt: ctx.now } } : {}, !trash)
    return { orders: result.items.map(order => view(order, ctx.actor.id)), nextCursor: result.nextCursor }
  }},
  'productOrders.messages': { async run(ctx, data) {
    await load(ctx, data.id)
    return messages(ctx, data)
  }},
  'productOrders.archive': {
    write: true, prepare(data) {
      check(data.days === undefined || [7, 30].includes(data.days), 'INVALID_INPUT', '保留期只能选择 7 天或 30 天')
      return { id: v.id(data.id), days: data.days === undefined ? 7 : data.days }
    },
    async run(ctx, data) {
      const order = await load(ctx, data.id)
      check(ENDED.includes(order.status), 'INVALID_ORDER_STATE', '只有已完成或已取消的交易可以删除记录')
      const role = roleOf(order, ctx.actor.id)
      if (!order[role + 'Archived']) {
        Object.assign(order, { [role + 'Archived']: true, [role + 'ArchivedAt']: ctx.now,
          [role + 'ArchiveExpiresAt']: new Date(Date.parse(ctx.now) + data.days * 86400000).toISOString(),
          [role + 'RetentionDays']: data.days, [role + 'ArchiveKey']: ctx.now + '_' + order.id })
        await ctx.store.put('product_orders', order.id, order)
      }
      return { order: view(order, ctx.actor.id) }
    }
  },
  'productOrders.restore': {
    write: true, prepare: data => ({ id: v.id(data.id) }),
    async run(ctx, data) {
      const order = await load(ctx, data.id), role = roleOf(order, ctx.actor.id)
      check(ENDED.includes(order.status), 'INVALID_ORDER_STATE', '当前订单不能恢复')
      if (order[role + 'Archived']) {
        order[role + 'Archived'] = false
        for (const suffix of ['ArchivedAt', 'ArchiveExpiresAt', 'RetentionDays', 'ArchiveKey']) delete order[role + suffix]
        await ctx.store.put('product_orders', order.id, order)
      }
      return { order: view(order, ctx.actor.id) }
    }
  },
  'productOrders.clear': {
    write: true,
    prepare(data) {
      check(Array.isArray(data.ids) && data.ids.length > 0 && data.ids.length <= 20, 'INVALID_INPUT', '每次可清理 1 至 20 条记录')
      return { ids: [...new Set(data.ids.map(v.id))] }
    },
    async run(ctx, data) {
      for (const id of data.ids) {
        const order = await ctx.store.get('product_orders', id)
        check(order, 'ORDER_NOT_FOUND', '交易订单不存在')
        check([order.buyerId, order.sellerId].includes(ctx.actor.id), 'FORBIDDEN', '只能清理自己的记录')
        const role = roleOf(order, ctx.actor.id)
        check(ENDED.includes(order.status) && order[role + 'Archived'] === true,
          'INVALID_ORDER_STATE', '只能清理回收站内的已结束订单')
        if (order[role + 'ClearedAt']) continue
        // Keep the shared order and the other participant's history intact.
        order[role + 'OriginalArchiveExpiresAt'] = order[role + 'ArchiveExpiresAt']
        order[role + 'ArchiveExpiresAt'] = ctx.now
        order[role + 'ClearedAt'] = ctx.now
        await ctx.store.put('product_orders', id, order)
      }
      return { clearedIds: data.ids }
    }
  },
  'productOrders.send': {
    write: true, prepare: data => ({ id: v.id(data.id), content: v.text(data.content, 1, 500, '留言') }), content: data => data.content,
    async run(ctx, data) {
      const order = await load(ctx, data.id)
      check(OPEN.includes(order.status), 'ORDER_CLOSED', '交易已结束，不能继续留言')
      await m.activeSeller(ctx, order.sellerId); await m.activeSeller(ctx, order.buyerId)
      const message = { id: v.hash('product-message', ctx.operationId), orderId: order.id, senderId: ctx.actor.id,
        senderNickname: ctx.actor.nickname, content: data.content, createdAt: ctx.now }
      message.newestKey = m.newestKey(message)
      await ctx.store.put('product_messages', message.id, message)
      return { message: { id: message.id, senderId: message.senderId, senderNickname: message.senderNickname, content: message.content, createdAt: message.createdAt } }
    }
  }
}
for (const action of ['accept', 'confirm', 'cancel', 'cancelRespond']) {
  routes['productOrders.' + action] = {
    write: true,
    prepare(data) {
      const value = { id: v.id(data.id) }
      if (action === 'cancel') value.reason = v.text(data.reason, 2, 300, '取消原因')
      if (action === 'cancelRespond') value.agree = v.bool(data.agree)
      return value
    }, content: data => data.reason,
    async run(ctx, data) {
      const order = await load(ctx, data.id)
      await m.activeSeller(ctx, order.sellerId); await m.activeSeller(ctx, order.buyerId)
      if (action === 'accept') {
        check(order.sellerId === ctx.actor.id, 'FORBIDDEN', '只有卖家可以确认预约')
        check(order.status === 'PENDING', 'INVALID_ORDER_STATE', '当前订单不能确认预约')
        order.status = 'ACCEPTED'
      } else if (action === 'confirm') {
        check(order.buyerId === ctx.actor.id, 'FORBIDDEN', '只有买家可以确认收货')
        check(order.status === 'ACCEPTED', 'INVALID_ORDER_STATE', '当前订单不能确认收货')
        await finish(ctx, order, 'COMPLETED')
      } else if (action === 'cancel') {
        check(['PENDING', 'ACCEPTED'].includes(order.status), 'INVALID_ORDER_STATE', '当前订单不能申请取消')
        order.cancelReason = data.reason; order.cancelRequestedBy = ctx.actor.id
        if (order.status === 'PENDING') await finish(ctx, order, 'CANCELLED')
        else order.status = 'CANCEL_PENDING'
      } else {
        check(order.status === 'CANCEL_PENDING', 'INVALID_ORDER_STATE', '没有待处理的取消申请')
        check(order.cancelRequestedBy !== ctx.actor.id, 'FORBIDDEN', '需由另一方处理取消申请')
        if (data.agree) await finish(ctx, order, 'CANCELLED')
        else order.status = 'DISPUTED'
      }
      order.updatedAt = ctx.now
      await ctx.store.put('product_orders', order.id, order)
      return { order: view(order, ctx.actor.id) }
    }
  }
}
module.exports = routes
// Helpers are imported separately through a non-enumerable property, not exposed as API routes.
Object.defineProperty(module.exports, '_helpers', { value: { load, view, finish } })
