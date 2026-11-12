const express = require('express')
const { getPool } = require('../../db/pool')
const { requireAdmin } = require('../../middleware/authenticate')
const { asyncRoute, HttpError } = require('../../lib/errors')
const { idParam, reason: validateReason } = require('../../lib/validation')

const router = express.Router()
router.use(requireAdmin)
for (const name of ['taskId', 'reportId', 'userId', 'id']) router.param(name, idParam)

async function logAction(connection, adminId, action, targetType, targetId, details = {}) {
  await connection.execute(
    'INSERT INTO admin_action_logs (admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
    [adminId, action, targetType, targetId, JSON.stringify(details)]
  )
}

router.get('/summary', asyncRoute(async (req, res) => {
  const [tasks] = await getPool().query(`SELECT COUNT(*) AS total, SUM(helper_id IS NOT NULL) AS accepted, SUM(status = 'COMPLETED') AS completed, SUM(status = 'CANCELLED') AS cancelled FROM tasks`)
  const [reports] = await getPool().query(`SELECT COUNT(*) AS total, SUM(status = 'OPEN') AS pending, AVG(TIMESTAMPDIFF(MINUTE, created_at, handled_at)) AS averageHandlingMinutes FROM reports`)
  res.json({ tasks: tasks[0], reports: reports[0] })
}))

router.get('/content/:type/:id', asyncRoute(async (req, res) => {
  const type = req.params.type.toUpperCase()
  const queries = {
    TASK: 'SELECT id, owner_id AS authorId, title, description AS content, public_area AS publicArea, status, visibility FROM tasks WHERE id = ?',
    POST: 'SELECT id, author_id AS authorId, content, status FROM posts WHERE id = ?',
    COMMENT: 'SELECT id, author_id AS authorId, content, status, post_id AS postId FROM comments WHERE id = ?',
    USER: 'SELECT id, id AS authorId, nickname AS content, status FROM users WHERE id = ?'
  }
  if (!queries[type]) throw new HttpError(400, '内容类型无效', 'INVALID_TARGET')
  const [rows] = await getPool().execute(queries[type], [req.params.id])
  if (!rows[0]) throw new HttpError(404, '内容不存在', 'TARGET_NOT_FOUND')
  res.json({ content: rows[0] })
}))

router.get('/reports', asyncRoute(async (req, res) => {
  const status = ['OPEN', 'RESOLVED', 'DISMISSED'].includes(req.query.status) ? req.query.status : 'OPEN'
  const [reports] = await getPool().execute(
    `SELECT r.id, r.reporter_id AS reporterId, u.nickname AS reporterNickname,
      r.target_type AS targetType, r.target_id AS targetId, r.reason, r.status,
      r.resolution, r.created_at AS createdAt, r.handled_at AS handledAt
     FROM reports r JOIN users u ON u.id = r.reporter_id
     WHERE r.status = ? ORDER BY r.created_at ASC LIMIT 200`,
    [status]
  )
  res.json({ reports })
}))

router.get('/cancellations', asyncRoute(async (req, res) => {
  const [tasks] = await getPool().execute(
    `SELECT t.id, t.title, t.status, t.cancel_reason AS cancelReason,
      t.cancel_requested_by AS cancelRequestedBy, t.cancel_resume_status AS resumeStatus,
      t.public_area AS publicArea, t.created_at AS createdAt,
      owner.nickname AS ownerNickname, helper.nickname AS helperNickname
     FROM tasks t JOIN users owner ON owner.id = t.owner_id
     JOIN users helper ON helper.id = t.helper_id
     WHERE t.status IN ('CANCEL_PENDING', 'CANCEL_DISPUTED') ORDER BY t.updated_at ASC LIMIT 100`
  )
  res.json({ tasks })
}))

router.post('/tasks/:taskId/cancellation', asyncRoute(async (req, res) => {
  if (typeof req.body.cancelled !== 'boolean') throw new HttpError(400, '请指定是否同意取消', 'INVALID_DECISION')
  const reason = validateReason(req.body.reason)
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT t.id, t.status, t.cancel_resume_status, owner.status AS owner_status, helper.status AS helper_status
       FROM tasks t JOIN users owner ON owner.id = t.owner_id
       LEFT JOIN users helper ON helper.id = t.helper_id WHERE t.id = ? FOR UPDATE`,
      [req.params.taskId]
    )
    const task = rows[0]
    if (!task) throw new HttpError(404, '任务不存在', 'TASK_NOT_FOUND')
    if (!['CANCEL_PENDING', 'CANCEL_DISPUTED'].includes(task.status)) throw new HttpError(409, '任务没有待处理的取消申请', 'INVALID_TASK_STATE')
    if (!req.body.cancelled && (task.owner_status !== 'ACTIVE' || task.helper_status !== 'ACTIVE')) {
      throw new HttpError(409, '参与者账号仍被封禁，请取消任务或先处理账号状态', 'PARTICIPANT_BLOCKED')
    }
    const status = req.body.cancelled ? 'CANCELLED' : task.cancel_resume_status
    await connection.execute(
      `UPDATE tasks SET status = ?, cancel_requested_by = NULL, cancel_reason = NULL, cancel_resume_status = NULL WHERE id = ?`,
      [status, task.id]
    )
    await logAction(connection, req.admin.id, 'CANCELLATION_RESOLVED', 'TASK', task.id, { cancelled: req.body.cancelled, reason })
    await connection.execute('INSERT INTO task_events (task_id, event_type, details) VALUES (?, ?, ?)', [task.id, 'ADMIN_CANCELLATION_RESOLVED', JSON.stringify({ adminId: req.admin.id, reason, status })])
    await connection.commit()
    res.json({ taskId: task.id, status })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}))

router.post('/reports/:reportId/resolve', asyncRoute(async (req, res) => {
  const status = String(req.body.status || '')
  const resolution = validateReason(req.body.resolution)
  if (!['RESOLVED', 'DISMISSED'].includes(status)) throw new HttpError(400, '处理结果无效', 'INVALID_RESOLUTION')
  if (resolution.length > 500) throw new HttpError(400, '处理说明不能超过 500 个字符', 'INVALID_RESOLUTION')
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute('SELECT id, status FROM reports WHERE id = ? FOR UPDATE', [req.params.reportId])
    if (!rows[0]) throw new HttpError(404, '举报不存在', 'REPORT_NOT_FOUND')
    if (rows[0].status !== 'OPEN') throw new HttpError(409, '举报已处理', 'REPORT_ALREADY_HANDLED')
    await connection.execute(
      'UPDATE reports SET status = ?, handled_by = ?, resolution = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, req.admin.id, resolution, req.params.reportId]
    )
    await logAction(connection, req.admin.id, 'REPORT_RESOLVED', 'REPORT', req.params.reportId, { status, resolution })
    await connection.commit()
    res.json({ id: Number(req.params.reportId), status })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}))

router.post('/content/:type/:id/hide', asyncRoute(async (req, res) => {
  const type = String(req.params.type || '').toUpperCase()
  const id = String(req.params.id || '')
  const reason = validateReason(req.body.reason)
  const targets = {
    TASK: { table: 'tasks', status: 'CANCELLED' },
    POST: { table: 'posts', status: 'HIDDEN' },
    COMMENT: { table: 'comments', status: 'HIDDEN' }
  }
  const target = targets[type]
  if (!target || !/^\d+$/.test(id)) throw new HttpError(400, '下架对象无效', 'INVALID_TARGET')
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(`SELECT id FROM ${target.table} WHERE id = ? FOR UPDATE`, [id])
    if (!rows[0]) throw new HttpError(404, '内容不存在', 'TARGET_NOT_FOUND')
    if (type === 'TASK') {
      await connection.execute("UPDATE tasks SET visibility = 'HIDDEN', status = IF(status IN ('COMPLETED', 'CANCELLED'), status, 'CANCELLED') WHERE id = ?", [id])
      await connection.execute('INSERT INTO task_events (task_id, event_type, details) VALUES (?, ?, ?)', [id, 'MODERATED', JSON.stringify({ adminId: req.admin.id, reason })])
    } else {
      await connection.execute(`UPDATE ${target.table} SET status = ? WHERE id = ?`, [target.status, id])
    }
    await logAction(connection, req.admin.id, 'CONTENT_HIDDEN', type, id, { reason })
    await connection.commit()
    res.json({ targetType: type, targetId: Number(id), status: target.status })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}))

router.patch('/users/:userId/status', asyncRoute(async (req, res) => {
  const status = String(req.body.status || '')
  const reason = validateReason(req.body.reason)
  if (!['ACTIVE', 'BLOCKED'].includes(status)) throw new HttpError(400, '账号状态无效', 'INVALID_STATUS')
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute('SELECT id, status FROM users WHERE id = ? FOR UPDATE', [req.params.userId])
    if (!rows[0]) throw new HttpError(404, '用户不存在', 'USER_NOT_FOUND')
    await connection.execute('UPDATE users SET status = ? WHERE id = ?', [status, req.params.userId])
    if (status === 'BLOCKED' && rows[0].status !== 'BLOCKED') {
      const [tasks] = await connection.execute(
        `SELECT id, owner_id, helper_id, status, cancel_resume_status, cancel_reason
         FROM tasks WHERE (owner_id = ? OR helper_id = ?)
           AND status IN ('OPEN', 'ASSIGNED', 'COMPLETION_PENDING', 'CANCEL_PENDING')
         FOR UPDATE`,
        [req.params.userId, req.params.userId]
      )
      for (const task of tasks) {
        if (task.status === 'OPEN') {
          await connection.execute("UPDATE tasks SET visibility = 'HIDDEN', status = 'CANCELLED' WHERE id = ?", [task.id])
          await connection.execute(
            'INSERT INTO task_events (task_id, event_type, details) VALUES (?, ?, ?)',
            [task.id, 'ADMIN_USER_BLOCKED', JSON.stringify({ adminId: req.admin.id, userId: Number(req.params.userId), reason, previousStatus: task.status })]
          )
          continue
        }
        const resumeStatus = task.status === 'CANCEL_PENDING' ? task.cancel_resume_status : task.status
        const cancelReason = `账号封禁，需管理员处理：${reason}`.slice(0, 300)
        await connection.execute(
          `UPDATE tasks SET visibility = 'HIDDEN', status = 'CANCEL_DISPUTED',
            cancel_requested_by = ?, cancel_reason = ?, cancel_resume_status = ? WHERE id = ?`,
          [req.params.userId, cancelReason, resumeStatus, task.id]
        )
        await connection.execute(
          'INSERT INTO task_events (task_id, event_type, details) VALUES (?, ?, ?)',
          [task.id, 'ADMIN_USER_BLOCKED', JSON.stringify({ adminId: req.admin.id, userId: Number(req.params.userId), reason, previousStatus: task.status, previousCancelReason: task.cancel_reason })]
        )
      }
    }
    await logAction(connection, req.admin.id, status === 'BLOCKED' ? 'USER_BLOCKED' : 'USER_RESTORED', 'USER', req.params.userId, { reason })
    await connection.commit()
    res.json({ userId: Number(req.params.userId), status })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}))

router.get('/users', asyncRoute(async (req, res) => {
  const term = `%${String(req.query.q || '').trim().slice(0, 60)}%`
  const [users] = await getPool().execute(
    `SELECT id, nickname, status, created_at AS createdAt FROM users
     WHERE nickname LIKE ? ORDER BY created_at DESC LIMIT 100`,
    [term]
  )
  res.json({ users })
}))

router.get('/actions', asyncRoute(async (req, res) => {
  const [actions] = await getPool().execute(
    `SELECT l.id, l.action, l.target_type AS targetType, l.target_id AS targetId,
      l.details, l.created_at AS createdAt, a.username AS adminUsername
     FROM admin_action_logs l JOIN admin_users a ON a.id = l.admin_id
     ORDER BY l.created_at DESC LIMIT 100`
  )
  res.json({ actions })
}))

module.exports = router
