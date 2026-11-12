const express = require('express')
const { getPool } = require('../../db/pool')
const { requireUser } = require('../../middleware/authenticate')
const { asyncRoute, HttpError } = require('../../lib/errors')
const { checkText } = require('../../lib/content-guard')

const router = express.Router()
const targetTables = {
  TASK: ['tasks', 'id'],
  POST: ['posts', 'id'],
  COMMENT: ['comments', 'id'],
  USER: ['users', 'id']
}

router.use(requireUser)

router.post('/', asyncRoute(async (req, res) => {
  const type = String(req.body.targetType || '').toUpperCase()
  const targetId = String(req.body.targetId || '')
  const reason = String(req.body.reason || '').trim()
  if (!targetTables[type] || !/^\d+$/.test(targetId)) throw new HttpError(400, '举报对象无效', 'INVALID_TARGET')
  if (reason.length < 2 || reason.length > 500) throw new HttpError(400, '请填写 2–500 个字符的举报原因', 'INVALID_REASON')
  const [rows] = await getPool().execute(`SELECT id FROM ${targetTables[type][0]} WHERE id = ?`, [targetId])
  if (!rows[0]) throw new HttpError(404, '举报对象不存在', 'TARGET_NOT_FOUND')
  await checkText(reason, req.user.openid)
  const [result] = await getPool().execute(
    'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)',
    [req.user.id, type, targetId, reason]
  )
  res.status(201).json({ id: result.insertId, status: 'OPEN' })
}))

module.exports = router
