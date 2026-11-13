const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHandler, actorKey } = require('../../cloudfunctions/campus-api/app')
const { createMemoryStore } = require('../helpers/memory-store')
const { createCallback } = require('../../cloudfunctions/media-callback/handler')
const { rankKey } = require('../../cloudfunctions/campus-api/lib/market')
const { decodeImage } = require('../../cloudfunctions/campus-api/lib/media')
const APP = 'wx' + '0'.repeat(16)
const base = { title: '高等数学教材', description: '九成新，含少量笔记', category: 'BOOKS', condition: 'GOOD', price: '12.30', publicArea: '图书馆门口' }
const image = Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(32)]).toString('base64')
function ok(r) { assert.equal(r.ok, true, JSON.stringify(r)); return r.data }
async function fixture() {
  const store = createMemoryStore(), identities = { a: { appid: APP, openid: 'a' }, b: { appid: APP, openid: 'b' }, c: { appid: APP, openid: 'c' }, admin: { uid: 'manager' } }
  let seq = 0, uploads = 0, urlCalls = 0, now = '2026-11-13T05:00:00.000Z'
  const media = { async upload(id) { uploads++; return { fileId: 'cloud://private/' + id, traceId: 'trace-' + id } },
    async check(id) { return { traceId: 'retry-' + id.replace(/[^a-zA-Z0-9]/g, '') } }, async urls(ids) { urlCalls++; return ids.map((_, i) => 'https://example.invalid/signed/' + i) } }
  const handle = createHandler({ store, checkText: async () => {}, media, allowedAppId: APP, clock: () => new Date(now) })
  const call = (who, action, data = {}, requestId = 'request_' + (++seq)) => handle({ action, data, requestId }, identities[who])
  const users = {}
  for (const who of ['a', 'b', 'c']) users[who] = ok(await call(who, 'users.login')).user
  const adminId = actorKey(identities.admin, true)
  await store.put('admin_users', adminId, { id: adminId, role: 'ADMIN', status: 'ACTIVE', username: 'manager' })
  const callback = createCallback({ store, allowedAppId: APP, clock: () => new Date(now) })
  async function upload(who = 'a', approve = true) {
    const asset = ok(await call(who, 'media.upload', { base64: image })).media
    const raw = await store.get('media_assets', asset.id)
    if (approve) await callback({ appid: APP, Event: 'wxa_media_check', MsgType: 'event', version: 2, trace_id: raw.traceId, errcode: 0, result: { suggest: 'pass' } }, 'wx_callback')
    return asset.id
  }
  async function product(overrides = {}, who = 'a') { return ok(await call(who, 'products.create', { ...base, imageIds: [await upload(who)], ...overrides })).product }
  return { store, call, handle, users, identities, callback, upload, product, uploads: () => uploads, urlCalls: () => urlCalls, setTime: value => { now = value } }
}
test('images fail closed, require trusted callback, ownership and one-product binding', async () => {
  const f = await fixture(), id = await f.upload('a', false), raw = await f.store.get('media_assets', id)
  assert.equal((await f.call('a', 'products.create', { ...base, imageIds: [id] })).error.code, 'IMAGE_NOT_APPROVED')
  const event = { appid: APP, Event: 'wxa_media_check', MsgType: 'event', version: 2, trace_id: raw.traceId, errcode: 0, result: { suggest: 'pass' } }
  for (const source of ['wx_trigger', 'wx_client', 'wx_devtools', 'scf']) {
    assert.equal((await f.callback({ ...event, SOURCE: 'wx_callback' }, source)).accepted, false)
  }
  assert.equal(await f.store.get('media_checks', require('node:crypto').createHash('sha256').update('media-check\0' + raw.traceId).digest('hex')), null)
  assert.equal((await f.callback({ ...event, appid: 'other' }, 'wx_callback')).accepted, false)
  assert.equal((await f.call('b', 'media.status', { ids: [id] })).error.code, 'FORBIDDEN')
  await f.callback(event, 'wx_callback')
  assert.equal((await f.call('b', 'products.create', { ...base, imageIds: [id] })).error.code, 'INVALID_IMAGES')
  const p = ok(await f.call('a', 'products.create', { ...base, imageIds: [id] })).product
  assert.equal((await f.call('a', 'products.create', { ...base, imageIds: [id] })).error.code, 'INVALID_IMAGES')
  assert.equal(p.price, '12.30')
  assert.equal('fileId' in ok(await f.call('a', 'media.status', { ids: [id] })).media[0], false)
  assert.deepEqual(Object.keys(ok(await f.call('b', 'media.urls', { productIds: [p.id] })).urls), [p.id])
})
test('image rejection cannot be promoted by a conflicting replay and timeout never passes', async () => {
  const f = await fixture(), id = await f.upload('a', false), raw = await f.store.get('media_assets', id)
  const event = { appid: APP, Event: 'wxa_media_check', MsgType: 'event', version: 2, trace_id: raw.traceId, errcode: 0, result: { suggest: 'review' } }
  await f.callback(event, 'wx_callback'); await f.callback({ ...event, result: { suggest: 'pass' } }, 'wx_callback')
  assert.equal(ok(await f.call('a', 'media.status', { ids: [id] })).media[0].status, 'REJECTED')
  const pending = await f.upload('a', false)
  f.setTime('2026-11-13T06:00:00.000Z')
  assert.equal(ok(await f.call('a', 'media.status', { ids: [pending] })).media[0].status, 'ERROR')
  assert.throws(() => decodeImage({ base64: Buffer.alloc(701 * 1024).toString('base64') }))
  assert.throws(() => decodeImage({ base64: Buffer.from('<svg>bad</svg>').toString('base64') }))
})
test('upload response retry reuses object and idempotent result', async () => {
  const f = await fixture(), first = ok(await f.call('a', 'media.upload', { base64: image }, 'upload_same'))
  const second = ok(await f.call('a', 'media.upload', { base64: image }, 'upload_same'))
  assert.deepEqual(first, second); assert.equal(f.uploads(), 1)
})
test('visible product image URLs are signed in one batch and duplicate IDs are ignored', async () => {
  const f = await fixture(), first = await f.product({}, 'a'), second = await f.product({}, 'b')
  const result = ok(await f.call('c', 'media.urls', { productIds: [first.id, second.id, first.id] }))
  assert.equal(f.urlCalls(), 1)
  assert.deepEqual(Object.keys(result.urls).sort(), [first.id, second.id].sort())
  assert.equal(result.urls[first.id].length, 1)
  assert.equal(result.urls[second.id].length, 1)
})
test('concurrent favorites produce one record per user and exact count; unsetting hidden favorites is allowed', async () => {
  const f = await fixture(), p = await f.product()
  const results = await Promise.all(Array.from({ length: 15 }, () => f.call('b', 'favorites.set', { id: p.id, active: true })))
  results.forEach(ok)
  assert.equal((await f.store.get('products', p.id)).favoriteCount, 1)
  assert.equal((await f.store.list('favorites', { active: true })).length, 1)
  assert.equal((await f.call('a', 'favorites.set', { id: p.id, active: true })).error.code, 'OWN_PRODUCT')
  ok(await f.call('admin', 'admin.hideProduct', { id: p.id, reason: '测试管理下架' }))
  const hidden = ok(await f.call('b', 'favorites.list')).products[0]
  assert.equal(hidden.unavailable, true); assert.equal('description' in hidden, false)
  assert.deepEqual(ok(await f.call('b', 'media.urls', { productIds: [p.id] })).urls, {})
  ok(await f.call('b', 'favorites.set', { id: p.id, active: false }))
  assert.equal((await f.store.get('products', p.id)).favoriteCount, 0)
})
test('server search escapes regex, filters all records and pagination has no ties; cursor binds filters', async () => {
  const f = await fixture()
  for (let i = 0; i < 5; i++) await f.product({ title: '教材 ' + i, description: '含 C++ 示例', category: i === 0 ? 'DIGITAL' : 'BOOKS' })
  assert.equal(ok(await f.call('b', 'products.list', { q: 'C++', category: 'BOOKS' })).products.length, 4)
  assert.equal(ok(await f.call('b', 'products.list', { q: '.*' })).products.length, 0)
  const first = ok(await f.call('b', 'products.list', { sort: 'newest', pageSize: 2 }))
  const second = ok(await f.call('b', 'products.list', { sort: 'newest', pageSize: 2, cursor: first.nextCursor }))
  assert.equal(new Set([...first.products, ...second.products].map(x => x.id)).size, 4)
  assert.equal((await f.call('b', 'products.list', { q: 'changed', cursor: first.nextCursor })).error.code, 'INVALID_CURSOR')
})
test('seller withdrawal hides detail and images from others while retaining owner management', async () => {
  const f = await fixture(), p = await f.product()
  ok(await f.call('b', 'favorites.set', { id: p.id, active: true }))
  ok(await f.call('a', 'products.setStatus', { id: p.id, available: false }))
  assert.equal((await f.call('b', 'products.get', { id: p.id })).error.code, 'PRODUCT_NOT_FOUND')
  assert.equal(ok(await f.call('b', 'products.list')).products.length, 0)
  assert.equal(ok(await f.call('b', 'favorites.list')).products[0].unavailable, true)
  assert.deepEqual(ok(await f.call('b', 'media.urls', { productIds: [p.id] })).urls, {})
  assert.equal(ok(await f.call('a', 'products.get', { id: p.id })).product.status, 'WITHDRAWN')
  ok(await f.call('a', 'products.setStatus', { id: p.id, available: true }))
  assert.equal(ok(await f.call('b', 'products.get', { id: p.id })).product.status, 'AVAILABLE')
})
test('ranking balances recency with real favorites and recomputes on removal', async () => {
  const f = await fixture(), old = await f.product()
  f.setTime('2026-11-14T05:00:00.000Z')
  const recent = await f.product()
  assert.equal(ok(await f.call('b', 'products.list')).products[0].id, recent.id)
  ok(await f.call('b', 'favorites.set', { id: old.id, active: true }))
  assert.equal(ok(await f.call('c', 'products.list')).products[0].id, old.id)
  ok(await f.call('b', 'favorites.set', { id: old.id, active: false }))
  assert.equal(ok(await f.call('c', 'products.list')).products[0].id, recent.id)
  assert.equal((await f.store.get('products', old.id)).rankKey, rankKey(await f.store.get('products', old.id)))
})
test('concurrent buyers reserve one item once; snapshots and private messages remain protected', async () => {
  const f = await fixture(), p = await f.product()
  const results = await Promise.all(['b', 'c'].map(who => f.call(who, 'productOrders.create', { productId: p.id })))
  assert.equal(results.filter(x => x.ok).length, 1)
  assert.equal(results.find(x => !x.ok).error.code, 'PRODUCT_UNAVAILABLE')
  const buyer = results[0].ok ? 'b' : 'c', stranger = buyer === 'b' ? 'c' : 'b', order = results.find(x => x.ok).data.order
  assert.equal((await f.call(stranger, 'productOrders.get', { id: order.id })).error.code, 'FORBIDDEN')
  assert.equal((await f.call(stranger, 'productOrders.messages', { id: order.id })).error.code, 'FORBIDDEN')
  const messages = await Promise.all(Array.from({ length: 8 }, () => f.call(buyer, 'productOrders.send', { id: order.id, content: '明天图书馆见' }, 'same_message')))
  messages.forEach(ok); assert.equal((await f.store.list('product_messages')).length, 1)
  const detail = ok(await f.call(buyer, 'productOrders.get', { id: order.id, includeMessages: true }))
  assert.equal(detail.messages.length, 1)
  assert.equal(detail.messages[0].id, messages[0].data.message.id)
  assert.equal((await f.call('a', 'productOrders.confirm', { id: order.id })).error.code, 'FORBIDDEN')
  ok(await f.call(buyer, 'productOrders.confirm', { id: order.id }))
  assert.equal(order.status, 'ACCEPTED')
  assert.equal((await f.store.get('products', p.id)).status, 'SOLD')
  assert.equal((await f.call(buyer, 'productOrders.send', { id: order.id, content: 'new' })).error.code, 'ORDER_CLOSED')
})
test('new reservations enter delivery directly while legacy pending orders remain confirmable', async () => {
  const f = await fixture(), p = await f.product()
  const created = ok(await f.call('b', 'productOrders.create', { productId: p.id })).order
  assert.equal(created.status, 'ACCEPTED')
  const legacy = { ...created, id: 'legacy-order', status: 'PENDING', createdAt: '2026-11-13T05:00:00.000Z', updatedAt: '2026-11-13T05:00:00.000Z' }
  legacy.newestKey = legacy.createdAt + '_' + legacy.id
  await f.store.put('product_orders', legacy.id, legacy)
  ok(await f.call('a', 'productOrders.accept', { id: legacy.id }))
  assert.equal((await f.store.get('product_orders', legacy.id)).status, 'ACCEPTED')
  assert.equal((await f.call('a', 'productOrders.accept', { id: created.id })).error.code, 'INVALID_ORDER_STATE')
})
test('ended trade records are hidden per participant, expire on schedule and restore without deleting evidence', async () => {
  const f = await fixture(), p = await f.product(), order = ok(await f.call('b', 'productOrders.create', { productId: p.id })).order
  ok(await f.call('b', 'productOrders.confirm', { id: order.id }))
  const archived = ok(await f.call('b', 'productOrders.archive', { id: order.id, days: 30 }, 'archive_buyer_once')).order
  assert.equal(archived.retentionDays, 30)
  const expiresAt = archived.archiveExpiresAt
  assert.equal(ok(await f.call('b', 'productOrders.archive', { id: order.id, days: 7 }, 'archive_buyer_again')).order.archiveExpiresAt, expiresAt)
  assert.equal(ok(await f.call('b', 'productOrders.mine', { role: 'buyer', status: 'ended' })).orders.length, 0)
  const trash = ok(await f.call('b', 'productOrders.mine', { role: 'buyer', view: 'trash' })).orders
  assert.equal(trash.length, 1)
  assert.equal(trash[0].retentionDays, 30)
  assert.equal(ok(await f.call('a', 'productOrders.mine', { role: 'seller', status: 'ended' })).orders.length, 1)
  assert.equal(ok(await f.call('a', 'productOrders.mine', { role: 'seller', view: 'trash' })).orders.length, 0)
  assert.equal(ok(await f.call('admin', 'admin.productOrders', { status: 'COMPLETED' })).orders.length, 1)
  assert.equal((await f.call('c', 'productOrders.archive', { id: order.id })).error.code, 'FORBIDDEN')
  assert.equal((await f.call('b', 'productOrders.archive', { id: order.id, days: 14 })).error.code, 'INVALID_INPUT')
  f.setTime(expiresAt)
  assert.equal(ok(await f.call('b', 'productOrders.mine', { role: 'buyer', view: 'trash' })).orders.length, 0)
  assert.equal((await f.call('b', 'productOrders.get', { id: order.id })).error.code, 'ARCHIVE_EXPIRED')
  assert.equal((await f.call('b', 'productOrders.restore', { id: order.id })).error.code, 'ARCHIVE_EXPIRED')
  f.setTime('2026-12-14T05:00:00.001Z')
  assert.equal(ok(await f.call('a', 'productOrders.archive', { id: order.id })).order.retentionDays, 7)
  const restored = ok(await f.call('a', 'productOrders.restore', { id: order.id })).order
  assert.equal(restored.archived, false)
  assert.equal(ok(await f.call('a', 'productOrders.mine', { role: 'seller', status: 'ended' })).orders.length, 1)
  assert.equal((await f.store.get('product_orders', order.id)).status, 'COMPLETED')
})
test('only ended transactions can be archived and archive expiry is based on server time', async () => {
  const f = await fixture(), p = await f.product(), order = ok(await f.call('b', 'productOrders.create', { productId: p.id })).order
  assert.equal((await f.call('b', 'productOrders.archive', { id: order.id })).error.code, 'INVALID_ORDER_STATE')
  ok(await f.call('b', 'productOrders.cancel', { id: order.id, reason: '不再需要' }))
  assert.equal((await f.call('b', 'productOrders.archive', { id: order.id })).error.code, 'INVALID_ORDER_STATE')
  ok(await f.call('a', 'productOrders.cancelRespond', { id: order.id, agree: true }))
  const [first, concurrent] = await Promise.all([
    f.call('b', 'productOrders.archive', { id: order.id, days: 7 }, 'archive_race_seven'),
    f.call('b', 'productOrders.archive', { id: order.id, days: 30 }, 'archive_race_thirty')
  ])
  const firstExpiry = ok(first).order.archiveExpiresAt
  assert.equal(ok(concurrent).order.archiveExpiresAt, firstExpiry)
  assert.equal((Date.parse(firstExpiry) - Date.parse('2026-11-13T05:00:00.000Z')) / 86400000, 7,
    'the competing request must not extend the original retention period')
  assert.equal(ok(await f.call('b', 'productOrders.mine', { role: 'buyer', status: 'ended' })).orders.length, 0)
  f.setTime(firstExpiry)
  assert.equal(ok(await f.call('b', 'productOrders.mine', { role: 'buyer', view: 'trash' })).orders.length, 0)
  assert.equal((await f.call('b', 'productOrders.restore', { id: order.id })).error.code, 'ARCHIVE_EXPIRED')
  assert.equal(ok(await f.call('a', 'productOrders.mine', { role: 'seller', status: 'ended' })).orders.length, 1)
})
test('cancellation negotiation and admin decision release reservation; moderation cannot be reversed by seller', async () => {
  const f = await fixture(), p = await f.product(), order = ok(await f.call('b', 'productOrders.create', { productId: p.id })).order
  ok(await f.call('b', 'productOrders.cancel', { id: order.id, reason: '时间调整' }))
  assert.equal((await f.call('b', 'productOrders.cancelRespond', { id: order.id, agree: true })).error.code, 'FORBIDDEN')
  ok(await f.call('a', 'productOrders.cancelRespond', { id: order.id, agree: false }))
  assert.equal(ok(await f.call('admin', 'admin.productOrders', { status: 'DISPUTED' })).orders.length, 1)
  ok(await f.call('admin', 'admin.resolveProductOrder', { id: order.id, cancelled: false, reason: '双方协商继续' }))
  ok(await f.call('admin', 'admin.hideProduct', { id: p.id, reason: '核实违规' }))
  assert.equal((await f.call('a', 'products.setStatus', { id: p.id, available: true })).error.code, 'PRODUCT_MODERATED')
  ok(await f.call('admin', 'admin.resolveProductOrder', { id: order.id, cancelled: true, reason: '商品下架取消' }))
  assert.equal((await f.store.get('products', p.id)).status, 'WITHDRAWN')
  assert.equal((await f.store.list('admin_action_logs')).length, 3)
})
test('blocking seller hides active listings and rejects further trade', async () => {
  const f = await fixture(), p = await f.product()
  ok(await f.call('admin', 'admin.setUserStatus', { id: f.users.a.id, status: 'BLOCKED', reason: '测试封禁' }))
  assert.equal(ok(await f.call('b', 'products.list')).products.length, 0)
  assert.equal((await f.call('b', 'productOrders.create', { productId: p.id })).error.code, 'PRODUCT_NOT_FOUND')
  assert.equal((await f.call('b', 'admin.products')).error.code, 'ADMIN_REQUIRED')
})

test('trash pagination fills pages after expiry and rejects a cursor reused for another participant', async () => {
  const f = await fixture(), ids = []
  for (let i = 0; i < 6; i++) {
    f.setTime(`2026-11-13T05:00:0${i}.000Z`)
    const p = await f.product(), order = ok(await f.call('b', 'productOrders.create', { productId: p.id })).order
    ok(await f.call('b', 'productOrders.confirm', { id: order.id }))
    ok(await f.call('b', 'productOrders.archive', { id: order.id, days: [2, 4].includes(i) ? 7 : 30 }))
    ids.push(order.id)
  }
  const first = ok(await f.call('b', 'productOrders.mine', { role: 'buyer', view: 'trash', pageSize: 1 }))
  assert.deepEqual(first.orders.map(o => o.id), [ids[5]])
  f.setTime('2026-11-20T05:00:06.000Z')
  const second = ok(await f.call('b', 'productOrders.mine', { role: 'buyer', view: 'trash', pageSize: 2, cursor: first.nextCursor }))
  assert.deepEqual(second.orders.map(o => o.id), [ids[3], ids[1]])
  const third = ok(await f.call('b', 'productOrders.mine', { role: 'buyer', view: 'trash', pageSize: 2, cursor: second.nextCursor }))
  assert.deepEqual(third.orders.map(o => o.id), [ids[0]])
  assert.equal(third.nextCursor, '')
  assert.equal((await f.call('c', 'productOrders.mine', { view: 'trash', cursor: first.nextCursor })).error.code, 'INVALID_CURSOR')
  assert.equal(ok(await f.call('b', 'productOrders.mine')).orders.length, 0)
})

test('both participants can archive concurrently and restoring one never changes the other', async () => {
  const f = await fixture(), p = await f.product(), order = ok(await f.call('b', 'productOrders.create', { productId: p.id })).order
  ok(await f.call('b', 'productOrders.send', { id: order.id, content: '图书馆交付' }))
  ok(await f.call('b', 'productOrders.confirm', { id: order.id }))
  const before = await f.store.get('product_orders', order.id)
  const archived = await Promise.all([
    f.call('a', 'productOrders.archive', { id: order.id, days: 7 }),
    f.call('b', 'productOrders.archive', { id: order.id, days: 30 })
  ])
  archived.forEach(ok)
  const both = await f.store.get('product_orders', order.id)
  assert.equal(both.sellerArchived, true); assert.equal(both.buyerArchived, true)
  assert.equal(both.updatedAt, before.updatedAt)
  const restores = await Promise.all(Array.from({ length: 5 }, () => f.call('a', 'productOrders.restore', { id: order.id }, 'restore_identical')))
  restores.forEach(result => assert.equal(ok(result).order.archived, false))
  assert.equal(ok(await f.call('a', 'productOrders.get', { id: order.id, includeMessages: true })).messages.length, 1)
  assert.equal(ok(await f.call('b', 'productOrders.mine', { view: 'trash' })).orders.length, 1)
  f.setTime('2026-12-13T05:00:00.000Z')
  assert.equal((await f.call('b', 'productOrders.messages', { id: order.id })).error.code, 'ARCHIVE_EXPIRED')
  assert.equal(ok(await f.call('a', 'productOrders.get', { id: order.id })).order.status, 'COMPLETED')
  assert.equal(ok(await f.call('admin', 'admin.productOrders')).orders.length, 1)
})

test('legacy pending reservations can still be cancelled without negotiation', async () => {
  const f = await fixture(), p = await f.product(), order = ok(await f.call('b', 'productOrders.create', { productId: p.id })).order
  const raw = await f.store.get('product_orders', order.id)
  await f.store.put('product_orders', order.id, { ...raw, status: 'PENDING' })
  assert.equal(ok(await f.call('b', 'productOrders.cancel', { id: order.id, reason: '旧订单取消' })).order.status, 'CANCELLED')
  assert.equal((await f.store.get('products', p.id)).status, 'AVAILABLE')
  assert.equal((await f.store.get('products', p.id)).activeOrderId, null)
})
