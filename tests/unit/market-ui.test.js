const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createMiniProgram } = require('../helpers/miniprogram')
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture(wxOverrides = {}) {
  const client = createMiniProgram({ wxOverrides })
  client.app.ensureLogin = async () => ({ id: 'buyer' })
  return { ...client, market: client.load('./services/market'), images: client.load('./services/images') }
}

test('market search and category changes discard older results and cursors', async () => {
  const c = fixture(), reads = []
  c.market.list = query => { const r = { query, ...deferred() }; reads.push(r); return r.promise }
  const page = c.page('./pages/products/list/index.js'), old = page.load()
  await tick()
  page.setData({ keyword: '教材' })
  const latest = page.selectCategory({ currentTarget: { dataset: { value: 'BOOKS' } } })
  await tick()
  reads[1].resolve({ products: [{ id: 'book' }], nextCursor: 'book-cursor' }); await latest
  reads[0].resolve({ products: [{ id: 'old' }], nextCursor: 'old-cursor' }); await old
  assert.deepEqual(Array.from(page.data.products, p => p.id), ['book'])
  assert.equal(page.data.cursor, 'book-cursor')
  assert.equal(reads[1].query.q, '教材')
  assert.equal(reads[1].query.category, 'BOOKS')
})

test('late product detail reads cannot undo an acknowledged favorite', async () => {
  const c = fixture(), pending = deferred()
  const page = c.page('./pages/products/detail/index.js')
  page.id = 'product'; page.setData({ product: { id: 'product', favorited: false, favoriteCount: 0 } })
  c.market.get = () => pending.promise
  c.market.favorite = async () => ({ active: true, favoriteCount: 1 })
  const old = page.load(); await tick(); await page.favorite()
  pending.resolve({ id: 'product', favorited: false, favoriteCount: 0 }); await old
  assert.equal(page.data.product.favorited, true)
  assert.equal(page.data.product.favoriteCount, 1)
})

test('late recommendation pages cannot undo a favorite or duplicate the product', async () => {
  const c = fixture(), read = deferred()
  const page = c.page('./pages/products/list/index.js')
  page.setData({ products: [{ id: 'book', favorited: false, favoriteCount: 0 }], cursor: 'next' })
  c.market.list = () => read.promise
  c.market.favorite = async () => ({ active: true, favoriteCount: 1 })
  const loading = page.load(true); await tick()
  await page.favorite({ detail: { id: 'book', active: true } })
  read.resolve({ products: [{ id: 'book', favorited: false, favoriteCount: 0 }, { id: 'new' }], nextCursor: '' })
  await loading
  assert.deepEqual(Array.from(page.data.products, p => p.id), ['book', 'new'])
  assert.equal(page.data.products[0].favorited, true)
  assert.equal(page.data.products[0].favoriteCount, 1)
  assert.equal(page.data.loading, false)
})

test('favorite receipts survive a concurrent category read without freezing future counts', async () => {
  const c = fixture(), write = deferred(), read = deferred()
  const page = c.page('./pages/products/list/index.js')
  page.setData({ products: [{ id: 'book', favorited: false, favoriteCount: 0 }] })
  c.market.favorite = () => write.promise
  c.market.list = () => read.promise
  const saving = page.favorite({ detail: { id: 'book', active: true } })
  const loading = page.selectCategory({ currentTarget: { dataset: { value: 'BOOKS' } } }); await tick()
  write.resolve({ active: true, favoriteCount: 1 }); await saving
  read.resolve({ products: [{ id: 'book', favorited: false, favoriteCount: 0 }], nextCursor: '' }); await loading
  assert.equal(page.data.category, 'BOOKS')
  assert.equal(page.data.products[0].favorited, true)
  assert.equal(page.data.products[0].favoriteCount, 1)
  assert.equal(page.data.loading, false)
  c.market.list = async () => ({ products: [{ id: 'book', favorited: true, favoriteCount: 3 }], nextCursor: '' })
  await page.load()
  assert.equal(page.data.products[0].favoriteCount, 3, 'later reads must reflect other users\' favorites')
})

test('removing a favorite cannot cancel loading the newly selected personal library', async () => {
  const c = fixture(), removal = deferred(), mine = deferred()
  c.market.favorite = () => removal.promise; c.market.mine = () => mine.promise
  const page = c.page('./pages/products/library/index.js')
  page.setData({ mode: 'favorites', products: [{ id: 'favorite' }] })
  const removing = page.favorite({ detail: { id: 'favorite' } })
  const loading = page.select({ currentTarget: { dataset: { mode: 'mine' } } }); await tick()
  removal.resolve(); await removing
  assert.equal(page.data.loading, true)
  mine.resolve({ products: [{ id: 'my-product' }], nextCursor: '' }); await loading
  assert.deepEqual(Array.from(page.data.products, p => p.id), ['my-product'])
})

test('market order roles retain the selected status and discard old reads', async () => {
  const c = fixture(), reads = []
  c.market.orders = query => { const r = { query, ...deferred() }; reads.push(r); return r.promise }
  const page = c.page('./pages/product-orders/list/index.js')
  page.setData({ status: 'active' })
  const old = page.load(); await tick()
  const latest = page.selectRole({ currentTarget: { dataset: { role: 'seller' } } }); await tick()
  reads[1].resolve({ orders: [{ id: 'sold' }], nextCursor: '' }); await latest
  reads[0].resolve({ orders: [{ id: 'bought' }], nextCursor: '' }); await old
  assert.equal(reads[1].query.status, 'active')
  assert.deepEqual(Array.from(page.data.orders, p => p.id), ['sold'])
})

test('compressed uploads retry lower dimensions and reject oversized files before cloud upload', async () => {
  let sizes = [800 * 1024, 600 * 1024], calls = [], uploads = 0
  const c = fixture({
    getImageInfo: ({ success }) => success({ width: 4000, height: 2000 }),
    compressImage: args => { calls.push(args); args.success({ tempFilePath: 'compressed' }) },
    getFileSystemManager: () => ({
      getFileInfo: ({ success }) => success({ size: sizes.shift() }),
      readFile: ({ success }) => success({ data: 'image-data' })
    })
  })
  c.market.upload = async () => { uploads++; return { id: 'asset', status: 'PENDING' } }
  const result = await c.images.upload('original')
  assert.equal(calls.length, 2); assert.equal(calls[1].compressedWidth, 1200)
  assert.equal(calls[1].compressedHeight, 600); assert.equal(result.sizeLabel, '600KB')
  sizes = [800 * 1024, 800 * 1024, 800 * 1024]; calls = []
  await assert.rejects(() => c.images.upload('huge'), /700KB/)
  assert.equal(uploads, 1)
})

test('partial image upload failure keeps checking images already accepted by the server', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const c = fixture(), page = c.page('./pages/products/create/index.js')
  c.images.choose = async () => ({ tempFiles: [{ tempFilePath: 'first' }, { tempFilePath: 'second' }] })
  c.images.upload = async path => {
    if (path === 'second') throw new Error('第二张上传失败')
    return { id: 'asset', path, status: 'PENDING' }
  }
  c.market.mediaStatus = async () => [{ id: 'asset', status: 'PASSED' }]
  page.onShow()
  try {
    await page.choose()
    assert.match(page.data.uploadError, /第二张上传失败/)
    assert.equal(page.data.uploading, false)
    assert.equal(page.data.images.length, 1)
    t.mock.timers.tick(8000); await tick()
    assert.equal(page.data.images[0].status, 'PASSED')
    assert.equal(page.data.images[0].label, '检查通过')
  } finally { page.onUnload() }
})

test('publishing waits for image approval and locks repeated submissions', async () => {
  const navigations = [], c = fixture({ redirectTo: ({ url }) => navigations.push(url) })
  const page = c.page('./pages/products/create/index.js')
  page.setData({ title: '教材', description: '九成新', price: '10', publicArea: '图书馆', images: [{ id: 'asset', status: 'PENDING' }] })
  let creates = 0
  c.market.mediaStatus = async () => [{ id: 'asset', status: 'REJECTED' }]
  c.market.create = async () => { creates++; return { product: { id: 'new' } } }
  await page.submit(); assert.equal(creates, 0); assert.match(page.data.error, /检查通过/)
  const pending = deferred()
  c.market.mediaStatus = () => pending.promise
  const first = page.submit(); await tick(); await page.submit()
  pending.resolve([{ id: 'asset', status: 'PASSED' }]); await first
  assert.equal(creates, 1); assert.deepEqual(navigations, ['/pages/products/detail/index?id=new'])
})

test('repeated trade-message taps send once and stale history cannot erase the receipt', async () => {
  const c = fixture(), oldRead = deferred(), sent = deferred()
  const page = c.page('./pages/product-orders/detail/index.js'); page.id = 'order'
  c.market.messages = () => oldRead.promise
  let sends = 0
  c.market.send = () => { sends++; return sent.promise }
  const loading = page.loadMessages(); page.setData({ draft: '图书馆见' })
  const sending = page.send(); await page.send()
  sent.resolve({ id: 'message', content: '图书馆见', createdAt: '2026-11-13T03:00:00Z' }); await sending
  oldRead.resolve({ messages: [], nextCursor: '' }); await loading
  assert.equal(sends, 1); assert.equal(page.data.messages[0].id, 'message'); assert.equal(page.data.draft, '')
})

test('buyers can report the product directly from an order while sellers cannot', () => {
  const c = fixture(), page = c.page('./pages/product-orders/detail/index.js')
  page.setData({ order: { isBuyer: true, productId: 'product' } })
  page.report()
  assert.deepEqual(c.navigation, ['/pages/report/create/index?type=PRODUCT&id=product'])
  page.setData({ order: { isBuyer: false, productId: 'product' } })
  page.report()
  assert.equal(c.navigation.length, 1)
})

test('refreshing a market order reloads its state and messages', async () => {
  const c = fixture(), page = c.page('./pages/product-orders/detail/index.js')
  page.id = 'order'
  page.setData({ order: { id: 'order', status: 'ACCEPTED' }, messages: [{ id: 'old' }] })
  c.market.orderDetail = async id => ({ order: { id, status: 'DISPUTED' }, messages: [{ id: 'new', content: '交易留言', createdAt: '2026-11-13T03:00:00Z' }], nextCursor: '' })
  await page.load()
  assert.equal(page.data.order.status, 'DISPUTED')
  assert.deepEqual(Array.from(page.data.messages, item => item.id), ['new'])
  assert.equal(page.data.loading, false)
  assert.equal(page.data.messageLoading, false)
})

test('forum comments render from the save receipt without reloading the post and retain later input', async () => {
  const c = fixture(), oldRead = deferred(), saved = deferred()
  const page = c.page('./pages/forum/detail/index.js')
  page.setData({ id: 'post', post: { id: 'post', commentCount: 2 }, comments: [{ id: 'old' }], commentText: '新评论' })
  let reads = 0, writes = 0
  c.forum.get = () => { reads++; return oldRead.promise }
  c.forum.comment = () => { writes++; return saved.promise }
  const loading = page.load(); await tick()
  const submitting = page.submitComment(); await page.submitComment()
  page.setData({ commentText: '后续草稿' })
  saved.resolve({ comment: { id: 'new', authorNickname: '同学', content: '新评论', createdAt: '2026-11-13T03:00:00Z' }, commentCount: 3 })
  await submitting
  oldRead.resolve({ id: 'post', commentCount: 2, comments: [{ id: 'old' }] }); await loading
  assert.equal(writes, 1)
  assert.equal(reads, 1)
  assert.deepEqual(Array.from(page.data.comments, comment => comment.id), ['old', 'new'])
  assert.equal(page.data.post.commentCount, 3)
  assert.equal(page.data.commentText, '后续草稿')
  assert.equal(page.data.submitting, false)
})

test('failed forum comment keeps the draft available for retry', async () => {
  const c = fixture(), page = c.page('./pages/forum/detail/index.js')
  page.setData({ id: 'post', post: { id: 'post', commentCount: 0 }, comments: [], commentText: '待重试内容' })
  c.forum.comment = async () => { throw new Error('內容审核未通过') }
  await page.submitComment()
  assert.equal(page.data.commentText, '待重试内容')
  assert.equal(page.data.comments.length, 0)
  assert.equal(page.data.submitting, false)
})

test('failed comment during refresh stops the spinner and keeps the current post and draft', async () => {
  const c = fixture(), read = deferred(), write = deferred(), page = c.page('./pages/forum/detail/index.js')
  page.setData({ id: 'post', post: { id: 'post', commentCount: 0 }, commentText: '待重试评论' })
  let reads = 0
  c.forum.get = () => { reads++; return read.promise }
  c.forum.comment = () => write.promise
  const loading = page.load(); await tick()
  const sending = page.submitComment(); await page.onShow()
  write.reject(new Error('网络连接失败')); await sending
  read.reject(new Error('过期读取失败')); await loading
  assert.equal(page.data.loading, false)
  assert.equal(page.data.post.id, 'post')
  assert.equal(page.data.commentText, '待重试评论')
  assert.equal(reads, 1)
})

test('archive chooses 30 days and repeated clicks perform only one write', async () => {
  const pending = deferred(), calls = [], c = fixture({
    showActionSheet: ({ success }) => success({ tapIndex: 1 }),
    showModal: ({ success }) => success({ confirm: true })
  }), page = c.page('./pages/product-orders/list/index.js')
  page.setData({ orders: [{ id: 'ended', canArchive: true }, { id: 'keep', canArchive: true }] })
  c.market.orderAction = (id, action, data) => { calls.push({ id, action, data }); return pending.promise }
  const event = { currentTarget: { dataset: { id: 'ended' } } }
  const first = page.archive(event); await tick(); await page.archive(event)
  assert.equal(calls.length, 1); assert.equal(calls[0].data.days, 30)
  pending.resolve({ id: 'ended', archived: true }); await first
  assert.deepEqual(Array.from(page.data.orders, o => o.id), ['keep'])
  assert.equal(page.data.busyId, '')
})

test('archive completion does not interrupt a newly selected status list', async () => {
  const pending = deferred(), reading = deferred(), c = fixture({
    showActionSheet: ({ success }) => success({ tapIndex: 0 }),
    showModal: ({ success }) => success({ confirm: true })
  }), page = c.page('./pages/product-orders/list/index.js')
  page.setData({ orders: [{ id: 'ended', canArchive: true }], status: 'ended' })
  c.market.orderAction = () => pending.promise
  c.market.orders = () => reading.promise
  const archive = page.archive({ currentTarget: { dataset: { id: 'ended' } } }); await tick()
  const loading = page.selectStatus({ currentTarget: { dataset: { value: 'active' } } }); await tick()
  pending.resolve({ id: 'ended', archived: true }); await archive
  assert.equal(page.data.loading, true)
  reading.resolve({ orders: [{ id: 'active' }], nextCursor: '' }); await loading
  assert.deepEqual(Array.from(page.data.orders, o => o.id), ['active'])
})

test('failed restore stays in trash and a successful retry removes only that record', async () => {
  const c = fixture(), page = c.page('./pages/product-orders/list/index.js')
  page.setData({ view: 'trash', orders: [{ id: 'ended', archived: true }, { id: 'keep', archived: true }] })
  const event = { currentTarget: { dataset: { id: 'ended' } } }
  c.market.orderAction = async () => { throw new Error('网络连接失败') }
  await page.restore(event)
  assert.equal(page.data.orders.length, 2); assert.equal(page.data.busyId, '')
  c.market.orderAction = async () => ({ id: 'ended', archived: false })
  await page.restore(event)
  assert.deepEqual(Array.from(page.data.orders, o => o.id), ['keep'])
})
