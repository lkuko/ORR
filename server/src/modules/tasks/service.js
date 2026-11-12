const repository = require('./repository')
const { getPool } = require('../../db/pool')
const { HttpError } = require('../../lib/errors')
const { checkText } = require('../../lib/content-guard')

const categories = new Set(['PACKAGE', 'FOOD', 'ERRAND', 'OTHER'])

async function get(id, userId) {
  const row = await repository.findById(getPool(), id)
  if (!row) throw new HttpError(404, '任务不存在', 'TASK_NOT_FOUND')
  if (row.visibility === 'HIDDEN' && row.owner_id !== userId && row.helper_id !== userId) throw new HttpError(404, '任务已下架', 'TASK_NOT_FOUND')
  return repository.mapTask(row, row.owner_id === userId || row.helper_id === userId)
}

async function list(query, userId) {
  const category = categories.has(query.category) ? query.category : null
  return repository.listOpen(userId, category)
}

async function listMine(userId, role) {
  return repository.listMine(userId, role === 'helper' ? 'helper' : 'owner')
}

async function create(user, data) {
  const title = String(data.title || '').trim()
  const description = String(data.description || '').trim()
  const category = String(data.category || '')
  const publicArea = String(data.publicArea || '').trim()
  const exactLocation = String(data.exactLocation || '').trim()
  const deadlineAt = data.deadlineAt ? new Date(data.deadlineAt) : null
  const rewardAmount = data.rewardAmount === '' || data.rewardAmount == null ? null : Number(data.rewardAmount)
  if (title.length < 2 || title.length > 100) throw new HttpError(400, '标题需为 2–100 个字符', 'INVALID_TITLE')
  if (!categories.has(category)) throw new HttpError(400, '请选择有效的任务类别', 'INVALID_CATEGORY')
  if (description.length < 2 || description.length > 1000) throw new HttpError(400, '说明需为 2–1000 个字符', 'INVALID_DESCRIPTION')
  if (!publicArea || publicArea.length > 100 || !exactLocation || exactLocation.length > 255) throw new HttpError(400, '请填写大致区域和具体地点', 'INVALID_LOCATION')
  if (rewardAmount !== null && (!/^\d{1,6}(\.\d{1,2})?$/.test(String(data.rewardAmount)) || !Number.isFinite(rewardAmount) || rewardAmount < 0 || rewardAmount > 999999.99)) throw new HttpError(400, '金额最多保留两位小数', 'INVALID_REWARD')
  if (deadlineAt && (Number.isNaN(deadlineAt.getTime()) || deadlineAt <= new Date())) throw new HttpError(400, '截止时间必须晚于现在', 'INVALID_DEADLINE')
  await checkText(`${title}\n${description}\n${publicArea}\n${exactLocation}`, user.openid)
  return repository.create(user.id, { title, category, description, rewardAmount, publicArea, exactLocation, deadlineAt })
}

async function transition(id, actorId, action) {
  await repository.transaction(async connection => {
    const task = await repository.findById(connection, id, true)
    if (!task) throw new HttpError(404, '任务不存在', 'TASK_NOT_FOUND')
    if (action === 'accept') {
      if (String(task.owner_id) === String(actorId)) throw new HttpError(400, '不能接自己发布的任务', 'CANNOT_ACCEPT_OWN_TASK')
      if (task.status !== 'OPEN' || task.visibility === 'HIDDEN' || (task.deadline_at && new Date(task.deadline_at) <= new Date())) throw new HttpError(409, '该任务已被接单、已过期或已关闭', 'TASK_NOT_OPEN')
      await connection.execute('UPDATE tasks SET helper_id = ?, status = \'ASSIGNED\' WHERE id = ? AND status = \'OPEN\'', [actorId, task.id])
      await repository.addEvent(connection, task.id, actorId, 'ACCEPTED')
      return
    }
    if (action === 'complete') {
      if (String(task.helper_id) !== String(actorId)) throw new HttpError(403, '只有接单者可以标记完成', 'FORBIDDEN')
      if (task.status !== 'ASSIGNED') throw new HttpError(409, '当前任务状态不能标记完成', 'INVALID_TASK_STATE')
      await connection.execute('UPDATE tasks SET status = \'COMPLETION_PENDING\' WHERE id = ?', [task.id])
      await repository.addEvent(connection, task.id, actorId, 'COMPLETION_SUBMITTED')
      return
    }
    if (action === 'confirm') {
      if (String(task.owner_id) !== String(actorId)) throw new HttpError(403, '只有发布者可以确认完成', 'FORBIDDEN')
      if (task.status !== 'COMPLETION_PENDING') throw new HttpError(409, '当前任务没有待确认的完成申请', 'INVALID_TASK_STATE')
      await connection.execute('UPDATE tasks SET status = \'COMPLETED\' WHERE id = ?', [task.id])
      await repository.addEvent(connection, task.id, actorId, 'COMPLETED')
      return
    }
    if (action === 'cancel-open') {
      if (String(task.owner_id) !== String(actorId)) throw new HttpError(403, '只有发布者可以取消未接单任务', 'FORBIDDEN')
      if (task.status !== 'OPEN') throw new HttpError(409, '已接单任务需要发起取消申请', 'INVALID_TASK_STATE')
      await connection.execute('UPDATE tasks SET status = \'CANCELLED\' WHERE id = ?', [task.id])
      await repository.addEvent(connection, task.id, actorId, 'CANCELLED_BEFORE_ACCEPT')
      return
    }
    throw new HttpError(400, '不支持的任务操作', 'INVALID_ACTION')
  })
  return get(id, actorId)
}

async function requestCancellation(id, actorId, reason) {
  const cleanReason = String(reason || '').trim()
  if (cleanReason.length < 2 || cleanReason.length > 300) throw new HttpError(400, '请填写 2–300 个字符的取消原因', 'INVALID_REASON')
  const actor = await getPool().execute('SELECT openid FROM users WHERE id = ?', [actorId]).then(([rows]) => rows[0])
  await checkText(cleanReason, actor.openid)
  await repository.transaction(async connection => {
    const task = await repository.findById(connection, id, true)
    if (!task) throw new HttpError(404, '任务不存在', 'TASK_NOT_FOUND')
    if (![String(task.owner_id), String(task.helper_id)].includes(String(actorId))) throw new HttpError(403, '只有订单双方可以申请取消', 'FORBIDDEN')
    if (!['ASSIGNED', 'COMPLETION_PENDING'].includes(task.status)) throw new HttpError(409, '当前任务状态不能申请取消', 'INVALID_TASK_STATE')
    await connection.execute(
      `UPDATE tasks SET status = 'CANCEL_PENDING', cancel_requested_by = ?, cancel_reason = ?, cancel_resume_status = ? WHERE id = ?`,
      [actorId, cleanReason, task.status, task.id]
    )
    await repository.addEvent(connection, task.id, actorId, 'CANCEL_REQUESTED', { reason: cleanReason })
  })
  return get(id, actorId)
}

async function decideCancellation(id, actorId, accepted) {
  if (typeof accepted !== 'boolean') throw new HttpError(400, '请确认是否同意取消', 'INVALID_DECISION')
  await repository.transaction(async connection => {
    const task = await repository.findById(connection, id, true)
    if (!task) throw new HttpError(404, '任务不存在', 'TASK_NOT_FOUND')
    if (![String(task.owner_id), String(task.helper_id)].includes(String(actorId)) || String(task.cancel_requested_by) === String(actorId)) {
      throw new HttpError(403, '只有另一方可以处理取消申请', 'FORBIDDEN')
    }
    if (task.status !== 'CANCEL_PENDING') throw new HttpError(409, '没有待处理的取消申请', 'INVALID_TASK_STATE')
    if (accepted) {
      await connection.execute("UPDATE tasks SET status = 'CANCELLED' WHERE id = ?", [task.id])
    } else {
      await connection.execute("UPDATE tasks SET status = 'CANCEL_DISPUTED' WHERE id = ?", [task.id])
    }
    await repository.addEvent(connection, task.id, actorId, accepted ? 'CANCEL_APPROVED' : 'CANCEL_DECLINED')
  })
  return get(id, actorId)
}

async function listMessages(id, userId) {
  const task = await repository.findById(getPool(), id)
  if (!task) throw new HttpError(404, '任务不存在', 'TASK_NOT_FOUND')
  if (![String(task.owner_id), String(task.helper_id)].includes(String(userId))) throw new HttpError(403, '只有订单双方可以查看留言', 'FORBIDDEN')
  const [messages] = await getPool().execute(
    `SELECT m.id, m.sender_id AS senderId, u.nickname AS senderNickname, m.content, m.created_at AS createdAt
     FROM task_messages m JOIN users u ON u.id = m.sender_id WHERE m.task_id = ? ORDER BY m.id DESC LIMIT 200`,
    [id]
  )
  return messages.reverse()
}

async function sendMessage(id, user, content) {
  const cleanContent = String(content || '').trim()
  if (!cleanContent || cleanContent.length > 500) throw new HttpError(400, '留言需为 1–500 个字符', 'INVALID_MESSAGE')
  const task = await repository.findById(getPool(), id)
  if (!task) throw new HttpError(404, '任务不存在', 'TASK_NOT_FOUND')
  if (![String(task.owner_id), String(task.helper_id)].includes(String(user.id))) throw new HttpError(403, '只有订单双方可以留言', 'FORBIDDEN')
  if (['COMPLETED', 'CANCELLED'].includes(task.status)) throw new HttpError(409, '已结束的订单不能继续留言', 'TASK_CLOSED')
  await checkText(cleanContent, user.openid)
  return repository.transaction(async connection => {
    const current = await repository.findById(connection, id, true)
    if (['COMPLETED', 'CANCELLED'].includes(current.status)) throw new HttpError(409, '订单已结束', 'TASK_CLOSED')
    const [result] = await connection.execute('INSERT INTO task_messages (task_id, sender_id, content) VALUES (?, ?, ?)', [id, user.id, cleanContent])
    return { id: result.insertId, senderId: user.id, senderNickname: user.nickname, content: cleanContent }
  })
}

module.exports = { get, list, listMine, create, transition, requestCancellation, decideCancellation, listMessages, sendMessage }
