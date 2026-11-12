const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createMiniProgram } = require('../helpers/miniprogram')
const { taskHint, filterOrders } = require('../../../utils/task-ui')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve))
const ids = tasks => Array.from(tasks, task => task.id)

function clientForPage() {
  const client = createMiniProgram()
  client.app.ensureLogin = async () => ({ id: 7, nickname: '测试同学' })
  return client
}

test('task search matches loaded titles and areas, trims input, and clearing restores the category', async () => {
  const client = clientForPage()
  let calls = 0
  client.tasks.list = async () => {
    calls++
    return [
      { id: 1, title: '帮取快递', publicArea: '东区', description: '送到图书馆' },
      { id: 2, title: '交课程材料', publicArea: '图书馆 A 区', description: '' }
    ]
  }
  const page = client.page('./pages/tasks/list/index.js')
  await page.loadTasks()
  page.onSearch({ detail: { value: '  快递  ' } })
  assert.deepEqual(ids(page.data.tasks), [1])
  page.onSearch({ detail: { value: '图书馆 a' } })
  assert.deepEqual(ids(page.data.tasks), [2])
  page.onSearch({ detail: { value: '不存在的任务' } })
  assert.deepEqual(ids(page.data.tasks), [])
  page.emptyAction()
  assert.equal(page.data.keyword, '')
  assert.deepEqual(ids(page.data.tasks), [1, 2])
  assert.equal(calls, 1, 'typing and clearing use the already loaded category')
})

test('a slow previous category cannot replace the newly selected category', async () => {
  const client = clientForPage()
  const requests = []
  client.tasks.list = ({ category }) => {
    const request = { category, ...deferred() }
    requests.push(request)
    return request.promise
  }
  const page = client.page('./pages/tasks/list/index.js')
  const previous = page.loadTasks()
  await nextTurn()
  page.selectCategory({ currentTarget: { dataset: { value: 'FOOD' } } })
  assert.deepEqual(ids(page.data.tasks), [], 'the previous category is cleared while switching')
  await nextTurn()
  assert.deepEqual(requests.map(request => request.category), ['ALL', 'FOOD'])
  requests[1].resolve([{ id: 2, title: '食堂带餐', publicArea: '食堂' }])
  await nextTurn()
  requests[0].resolve([{ id: 1, title: '旧任务', publicArea: '东区' }])
  await previous
  assert.equal(page.data.category, 'FOOD')
  assert.deepEqual(ids(page.data.tasks), [2])
  assert.equal(page.data.loading, false)
})

test('a late failure from an old task request cannot hide a successful refresh', async () => {
  const client = clientForPage()
  const oldRequest = deferred()
  let calls = 0
  client.tasks.list = () => ++calls === 1 ? oldRequest.promise : Promise.resolve([{ id: 2, title: '新任务', publicArea: '北区' }])
  const page = client.page('./pages/tasks/list/index.js')
  const previous = page.loadTasks()
  await nextTurn()
  await page.loadTasks()
  oldRequest.reject(new Error('旧请求超时'))
  await previous
  assert.equal(page.data.error, '')
  assert.deepEqual(ids(page.data.tasks), [2])
})

test('switching order roles keeps the newest response and the selected status filter', async () => {
  const client = clientForPage()
  const requests = []
  client.tasks.listMine = role => {
    const request = { role, ...deferred() }
    requests.push(request)
    return request.promise
  }
  const page = client.page('./pages/orders/list/index.js')
  const previous = page.load()
  await nextTurn()
  page.selectRole({ currentTarget: { dataset: { role: 'helper' } } })
  assert.deepEqual(ids(page.data.tasks), [], 'the previous role is cleared while switching')
  page.selectFilter({ currentTarget: { dataset: { value: 'active' } } })
  await nextTurn()
  assert.deepEqual(requests.map(request => request.role), ['owner', 'helper'])
  requests[1].resolve([
    { id: 2, ownerId: 9, helperId: 7, status: 'COMPLETION_PENDING' },
    { id: 3, ownerId: 9, helperId: 7, status: 'COMPLETED' }
  ])
  await nextTurn()
  requests[0].resolve([{ id: 1, ownerId: 7, status: 'OPEN' }])
  await previous
  assert.equal(page.data.role, 'helper')
  assert.deepEqual(ids(page.data.tasks), [2])
  assert.equal(page.data.tasks[0].nextHint, '已提交完成，等待发布者确认')
  page.selectFilter({ currentTarget: { dataset: { value: 'ended' } } })
  assert.deepEqual(ids(page.data.tasks), [3])
})

test('pending confirmations and disputed cancellations remain active orders', () => {
  const states = ['OPEN', 'ASSIGNED', 'COMPLETION_PENDING', 'CANCEL_PENDING', 'CANCEL_DISPUTED', 'COMPLETED', 'CANCELLED']
  const tasks = states.map((status, id) => ({ id, status }))
  assert.deepEqual(ids(filterOrders(tasks, 'active')), [0, 1, 2, 3, 4])
  assert.deepEqual(ids(filterOrders(tasks, 'ended')), [5, 6])
  assert.deepEqual(ids(filterOrders(tasks, 'all')), [0, 1, 2, 3, 4, 5, 6])
  assert.equal(tasks.length, 7, 'filtering does not mutate the loaded orders')
})

test('order guidance tells each participant who must confirm the next action', () => {
  const task = { ownerId: 7, helperId: 9, status: 'COMPLETION_PENDING' }
  assert.equal(taskHint(task, '7'), '请核实任务结果，再确认完成')
  assert.equal(taskHint(task, 9), '已提交完成，等待发布者确认')
  const cancellation = { ...task, status: 'CANCEL_PENDING', cancelRequestedBy: 9 }
  assert.equal(taskHint(cancellation, 7), '对方申请取消，等待你作出决定')
  assert.equal(taskHint(cancellation, '9'), '已申请取消，等待对方确认')
  assert.equal(taskHint({ ...task, status: 'OPEN', expired: true }, 9), '已超过截止时间，暂不可接单')
})

test('profile order shortcuts open the requested role and consume that choice once', async () => {
  const switches = []
  const client = createMiniProgram({ wxOverrides: { switchTab: options => switches.push(options.url) } })
  client.app.ensureLogin = async () => ({ id: 7 })
  const loadedRoles = []
  client.tasks.listMine = async role => { loadedRoles.push(role); return [] }
  const profile = client.page('./pages/profile/index/index.js')
  profile.openOrders({ currentTarget: { dataset: { role: 'helper' } } })
  assert.deepEqual(switches, ['/pages/orders/list/index'])
  const orders = client.page('./pages/orders/list/index.js')
  orders.onShow()
  await nextTurn()
  assert.deepEqual(loadedRoles, ['helper'])
  assert.equal(orders.data.role, 'helper')
  assert.equal(client.app.profileOrderRole, '')
})

test('rapid order-message taps send once and render the acknowledged message without another read', async () => {
  const client = clientForPage()
  const request = deferred()
  const sent = []
  let reads = 0
  client.tasks.sendMessage = (id, content) => { sent.push({ id, content }); return request.promise }
  client.tasks.messages = async () => { reads++; return [] }
  const page = client.page('./pages/tasks/detail/index.js')
  page.setData({ id: '12', userId: 7, task: { id: 12, ownerId: 7, helperId: 9, status: 'ASSIGNED' }, messages: [] })
  page.onMessageInput({ detail: { value: '  我已到东区门口  ' } })
  const first = page.sendMessage()
  const second = page.sendMessage()
  assert.equal(first, second)
  assert.deepEqual(sent, [{ id: '12', content: '我已到东区门口' }])
  assert.equal(page.data.sendingMessage, true)
  request.resolve({ id: 51, senderId: 7, senderNickname: '测试同学', content: '我已到东区门口' })
  await first
  assert.deepEqual(ids(page.data.messages), [51])
  assert.equal(page.data.message, '')
  assert.equal(page.data.sendingMessage, false)
  assert.equal(reads, 0, 'the POST response is enough to display a sent message')
  page.sendMessage()
  assert.equal(sent.length, 1, 'the cleared draft cannot be submitted again')
})

test('failed order-message send retains the draft and permits one retry', async () => {
  const notices = []
  const client = createMiniProgram({ wxOverrides: { showToast: notice => notices.push(notice.title) } })
  const requests = []
  client.tasks.sendMessage = () => {
    const request = deferred()
    requests.push(request)
    return request.promise
  }
  const page = client.page('./pages/tasks/detail/index.js')
  page.setData({ id: '12', userId: 7, task: { id: 12, ownerId: 7, helperId: 9, status: 'ASSIGNED' }, message: '测试留言' })
  const first = page.sendMessage()
  page.sendMessage()
  requests[0].reject(new Error('网络连接失败'))
  await first
  assert.deepEqual(notices, ['网络连接失败'])
  assert.equal(page.data.message, '测试留言')
  assert.equal(page.data.sendingMessage, false)
  const second = page.sendMessage()
  assert.equal(requests.length, 2)
  requests[1].resolve({ id: 52, senderId: 7, senderNickname: '测试同学', content: '测试留言' })
  await second
  assert.deepEqual(ids(page.data.messages), [52])
})

test('an older message-list response cannot erase a newly sent message', async () => {
  const client = clientForPage()
  const oldList = deferred()
  const send = deferred()
  client.tasks.messages = () => oldList.promise
  client.tasks.sendMessage = () => send.promise
  const page = client.page('./pages/tasks/detail/index.js')
  page.setData({ id: '12', userId: 7, task: { id: 12, ownerId: 7, helperId: 9, status: 'ASSIGNED' }, message: '新留言' })
  const loading = page.loadMessages()
  const sending = page.sendMessage()
  send.resolve({ id: 53, senderId: 7, senderNickname: '测试同学', content: '新留言' })
  await sending
  oldList.resolve([])
  await loading
  assert.deepEqual(ids(page.data.messages), [53])
})

test('forum refresh ignores a slower older response', async () => {
  const client = clientForPage()
  const requests = []
  client.forum.list = () => {
    const request = deferred()
    requests.push(request)
    return request.promise
  }
  const page = client.page('./pages/forum/list/index.js')
  const oldLoad = page.load()
  await nextTurn()
  const newLoad = page.load()
  await nextTurn()
  requests[1].resolve([{ id: 2, content: '新帖子' }])
  await newLoad
  requests[0].resolve([{ id: 1, content: '旧帖子' }])
  await oldLoad
  assert.deepEqual(ids(page.data.posts), [2])
  assert.equal(page.data.loading, false)
})
