const seed = {
  tasks: [
    { id: 'd1', ownerId: 'sample-a', ownerNickname: '林同学', title: '图书馆帮取一本预约书', category: 'ERRAND', description: '到一楼服务台报预约码取书，晚上前放到北门自提柜。', rewardAmount: 3, publicArea: '图书馆 / 北门', exactLocation: '图书馆一楼服务台', status: 'OPEN', createdAt: '刚刚' },
    { id: 'd2', ownerId: 'sample-b', ownerNickname: '小周', title: '食堂带一份晚饭到宿舍区', category: 'FOOD', description: '二食堂一楼打包，送到宿舍区门口。', rewardAmount: 2, publicArea: '二食堂 / 宿舍区', exactLocation: '二食堂一楼 12 号窗口', status: 'OPEN', createdAt: '12 分钟前' },
    { id: 'd3', ownerId: 'sample-c', ownerNickname: '阿杰', title: '帮忙取快递', category: 'PACKAGE', description: '驿站包裹不大，取后放到教学楼门口。', rewardAmount: null, publicArea: '菜鸟驿站 / 教学楼', exactLocation: '东区 3 号驿站', status: 'OPEN', createdAt: '半小时前' }
  ],
  posts: [
    { id: 'p1', authorId: 'sample-d', authorNickname: '小陈', content: '图书馆周末自习位一般几点开始紧张？最近准备去复习。', createdAt: '今天 09:30', comments: [{ id: 'c1', authorNickname: '林同学', content: '九点以后靠窗的位置比较难找。' }] },
    { id: 'p2', authorId: 'sample-e', authorNickname: 'Mia', content: '失物招领：在体育馆看台捡到一把黑色折叠伞，已交给前台。', createdAt: '昨天 18:20', comments: [] }
  ],
  messages: {}
}

function read() {
  return wx.getStorageSync('demoStore') || JSON.parse(JSON.stringify(seed))
}

function write(data) {
  wx.setStorageSync('demoStore', data)
  return data
}

function currentUser() {
  return wx.getStorageSync('demoUser') || { id: 'demo-user', nickname: '校园同学' }
}

function listTasks(query = {}) {
  const data = read()
  let tasks = data.tasks.filter(task => task.status === (query.status || 'OPEN'))
  if (query.category && query.category !== 'ALL') tasks = tasks.filter(task => task.category === query.category)
  return Promise.resolve(tasks.slice().reverse().map(task => ({ ...task, exactLocation: null })))
}

function listMine(role) {
  const user = currentUser()
  return Promise.resolve(read().tasks.filter(task => role === 'helper' ? task.helperId === user.id : task.ownerId === user.id).slice().reverse())
}

function getTask(id) {
  const task = read().tasks.find(item => String(item.id) === String(id))
  if (!task) return Promise.reject(new Error('任务不存在'))
  const user = currentUser()
  const canSeeExactLocation = task.ownerId === user.id || task.helperId === user.id
  return Promise.resolve({ ...task, exactLocation: canSeeExactLocation ? task.exactLocation : null, canSeeExactLocation })
}

function createTask(input) {
  const user = currentUser()
  const data = read()
  const task = {
    id: `d${Date.now()}`, ownerId: user.id, ownerNickname: user.nickname, helperId: null,
    title: input.title, category: input.category, description: input.description,
    rewardAmount: input.rewardAmount === '' ? null : Number(input.rewardAmount),
    publicArea: input.publicArea, exactLocation: input.exactLocation,
    status: 'OPEN', deadlineAt: input.deadlineAt || null, createdAt: new Date().toISOString()
  }
  data.tasks.push(task)
  write(data)
  return Promise.resolve(task)
}

function changeTask(id, action, payload = {}) {
  const data = read()
  const task = data.tasks.find(item => String(item.id) === String(id))
  const user = currentUser()
  if (!task) return Promise.reject(new Error('任务不存在'))
  if (action === 'accept') {
    if (task.status !== 'OPEN' || task.ownerId === user.id) return Promise.reject(new Error('该任务当前不可接单'))
    task.helperId = user.id
    task.helperNickname = user.nickname
    task.status = 'ASSIGNED'
  } else if (action === 'complete') {
    if (task.helperId !== user.id || task.status !== 'ASSIGNED') return Promise.reject(new Error('当前任务不能标记完成'))
    task.status = 'COMPLETION_PENDING'
  } else if (action === 'confirm') {
    if (task.ownerId !== user.id || task.status !== 'COMPLETION_PENDING') return Promise.reject(new Error('当前任务不能确认完成'))
    task.status = 'COMPLETED'
  } else if (action === 'cancel') {
    if (task.ownerId !== user.id || task.status !== 'OPEN') return Promise.reject(new Error('当前任务不能取消'))
    task.status = 'CANCELLED'
  } else if (action === 'cancel-request') {
    if (![task.ownerId, task.helperId].includes(user.id) || !['ASSIGNED', 'COMPLETION_PENDING'].includes(task.status)) return Promise.reject(new Error('当前任务不能申请取消'))
    if (!payload.reason || payload.reason.trim().length < 2) return Promise.reject(new Error('请填写取消原因'))
    task.cancelResumeStatus = task.status
    task.cancelRequestedBy = user.id
    task.cancelReason = payload.reason
    task.status = 'CANCEL_PENDING'
  } else if (action === 'cancel-confirm') {
    if (task.status !== 'CANCEL_PENDING' || task.cancelRequestedBy === user.id || ![task.ownerId, task.helperId].includes(user.id)) return Promise.reject(new Error('当前账号不能处理取消申请'))
    task.status = payload.accepted ? 'CANCELLED' : 'CANCEL_DISPUTED'
  }
  write(data)
  return getTask(id)
}

function listMessages(taskId) {
  const data = read()
  const task = data.tasks.find(item => String(item.id) === String(taskId))
  if (!task || ![task.ownerId, task.helperId].includes(currentUser().id)) return Promise.reject(new Error('只有订单双方可以查看留言'))
  return Promise.resolve(data.messages[taskId] || [])
}

function sendMessage(taskId, content) {
  const data = read()
  const user = currentUser()
  const task = data.tasks.find(item => String(item.id) === String(taskId))
  if (!task || ![task.ownerId, task.helperId].includes(user.id)) return Promise.reject(new Error('只有订单双方可以留言'))
  if (['COMPLETED', 'CANCELLED'].includes(task.status)) return Promise.reject(new Error('已结束的订单不能继续留言'))
  const message = { id: `m${Date.now()}`, senderId: user.id, senderNickname: user.nickname, content, createdAt: '刚刚' }
  data.messages[taskId] = [...(data.messages[taskId] || []), message]
  write(data)
  return Promise.resolve(message)
}

function listPosts() {
  return Promise.resolve(read().posts.slice().reverse())
}

function getPost(id) {
  const post = read().posts.find(item => String(item.id) === String(id))
  if (!post) return Promise.reject(new Error('帖子不存在'))
  return Promise.resolve(post)
}

function createPost(content) {
  const data = read()
  const user = currentUser()
  const post = { id: `p${Date.now()}`, authorId: user.id, authorNickname: user.nickname, content, createdAt: '刚刚', comments: [] }
  data.posts.push(post)
  write(data)
  return Promise.resolve(post)
}

function addComment(postId, content) {
  const data = read()
  const post = data.posts.find(item => String(item.id) === String(postId))
  if (!post) return Promise.reject(new Error('帖子不存在'))
  const user = currentUser()
  const comment = { id: `c${Date.now()}`, authorNickname: user.nickname, content }
  post.comments.push(comment)
  write(data)
  return Promise.resolve(comment)
}

module.exports = { listTasks, listMine, getTask, createTask, changeTask, listMessages, sendMessage, listPosts, getPost, createPost, addComment }
