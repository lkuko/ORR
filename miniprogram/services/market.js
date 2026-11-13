const { call, mutate } = require('./cloud')
const { productView, orderView } = require('../utils/market')
async function hydrate(products) {
  const ids = products.filter(item => !item.unavailable).map(item => item.id)
  const { urls } = ids.length ? await call('media.urls', { productIds: ids }) : { urls: {} }
  return products.map(item => productView({ ...item, urls: urls[item.id] || [] }))
}
async function list(action, data) {
  const result = await call(action, data)
  return { ...result, products: await hydrate(result.products) }
}
module.exports = {
  list: data => list('products.list', data), mine: data => list('products.mine', data), favorites: data => list('favorites.list', data),
  get: async id => (await hydrate([(await call('products.get', { id })).product]))[0],
  create: data => mutate('products.create', data),
  setStatus: (id, available) => mutate('products.setStatus', { id, available }),
  favorite: (id, active) => mutate('favorites.set', { id, active }),
  reserve: productId => mutate('productOrders.create', { productId }).then(data => orderView(data.order)),
  orders: async data => { const r = await call('productOrders.mine', data); return { ...r, orders: r.orders.map(orderView) } },
  orderDetail: id => call('productOrders.get', { id, includeMessages: true }).then(data => ({ ...data, order: orderView(data.order) })),
  orderAction: (id, action, data = {}) => mutate('productOrders.' + action, { id, ...data }).then(r => orderView(r.order)),
  clearOrders: ids => mutate('productOrders.clear', { ids }),
  archiveOrders: (ids, days) => mutate('productOrders.archiveMany', { ids, days }),
  messages: data => call('productOrders.messages', data),
  send: (id, content) => mutate('productOrders.send', { id, content }).then(r => r.message),
  upload: base64 => mutate('media.upload', { base64 }).then(r => r.media),
  mediaStatus: ids => call('media.status', { ids }).then(r => r.media),
  retryMedia: id => mutate('media.retry', { id }).then(r => r.media)
}
