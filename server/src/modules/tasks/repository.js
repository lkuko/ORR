const { getPool } = require('../../db/pool')

const taskSelect = `SELECT t.*, u.nickname AS owner_nickname, h.nickname AS helper_nickname
  FROM tasks t JOIN users u ON u.id = t.owner_id
  LEFT JOIN users h ON h.id = t.helper_id`

async function findById(executor, id, lock = false) {
  const [rows] = await executor.query(`${taskSelect} WHERE t.id = ?${lock ? ' FOR UPDATE' : ''}`, [id])
  return rows[0] || null
}

async function transaction(callback) {
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function addEvent(executor, taskId, actorId, eventType, details = null) {
  await executor.execute(
    'INSERT INTO task_events (task_id, actor_id, event_type, details) VALUES (?, ?, ?, ?)',
    [taskId, actorId, eventType, details ? JSON.stringify(details) : null]
  )
}

async function listOpen(userId, category) {
  const conditions = ['t.status = ?', "t.visibility = 'VISIBLE'", '(t.deadline_at IS NULL OR t.deadline_at > UTC_TIMESTAMP())']
  const params = ['OPEN']
  if (category) {
    conditions.push('t.category = ?')
    params.push(category)
  }
  const [rows] = await getPool().execute(`${taskSelect} WHERE ${conditions.join(' AND ')} ORDER BY t.created_at DESC LIMIT 100`, params)
  return rows.map(row => mapTask(row, row.owner_id === userId))
}

async function listMine(userId, role) {
  const column = role === 'helper' ? 't.helper_id' : 't.owner_id'
  const [rows] = await getPool().execute(`${taskSelect} WHERE ${column} = ? ORDER BY t.updated_at DESC LIMIT 100`, [userId])
  return rows.map(row => mapTask(row, true))
}

async function create(userId, input) {
  const [result] = await getPool().execute(
    `INSERT INTO tasks (owner_id, title, category, description, reward_amount, public_area, exact_location, deadline_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, input.title, input.category, input.description, input.rewardAmount, input.publicArea, input.exactLocation, input.deadlineAt]
  )
  return findById(getPool(), result.insertId).then(row => mapTask(row, true))
}

async function insertMessage(taskId, senderId, content) {
  const [result] = await getPool().execute('INSERT INTO task_messages (task_id, sender_id, content) VALUES (?, ?, ?)', [taskId, senderId, content])
  return { id: result.insertId, senderId, content }
}

function mapTask(row, showExactLocation) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    helperId: row.helper_id,
    ownerNickname: row.owner_nickname,
    helperNickname: row.helper_nickname,
    title: row.title,
    category: row.category,
    description: row.description,
    rewardAmount: row.reward_amount,
    publicArea: row.public_area,
    exactLocation: showExactLocation ? row.exact_location : null,
    canSeeExactLocation: showExactLocation,
    deadlineAt: row.deadline_at,
    status: row.status,
    visibility: row.visibility,
    createdAt: row.created_at,
    cancelRequestedBy: showExactLocation ? row.cancel_requested_by : null,
    cancelReason: showExactLocation ? row.cancel_reason : null
  }
}

module.exports = { findById, transaction, addEvent, listOpen, listMine, create, insertMessage, mapTask }
