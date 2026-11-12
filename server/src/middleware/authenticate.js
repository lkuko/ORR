const { env } = require('../config/env')
const { verifyToken } = require('../lib/tokens')
const { HttpError, asyncRoute } = require('../lib/errors')
const { getPool } = require('../db/pool')

const requireUser = asyncRoute(async (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  const payload = verifyToken(token, env.tokenSecret)
  if (!payload || payload.role !== 'user') throw new HttpError(401, '请先登录', 'UNAUTHORIZED')
  const [rows] = await getPool().execute('SELECT id, openid, nickname, status FROM users WHERE id = ?', [payload.sub])
  if (!rows[0] || rows[0].status !== 'ACTIVE') throw new HttpError(403, '账号不可用', 'ACCOUNT_BLOCKED')
  req.user = { id: rows[0].id, openid: rows[0].openid, nickname: rows[0].nickname }
  next()
})

const requireAdmin = asyncRoute(async (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  const payload = verifyToken(token, env.tokenSecret)
  if (!payload || payload.role !== 'admin') throw new HttpError(401, '管理员登录已失效', 'ADMIN_UNAUTHORIZED')
  const [rows] = await getPool().execute('SELECT id, username, status FROM admin_users WHERE id = ?', [payload.sub])
  if (!rows[0] || rows[0].status !== 'ACTIVE') throw new HttpError(403, '管理员账号不可用', 'ADMIN_BLOCKED')
  req.admin = { id: rows[0].id, username: rows[0].username }
  next()
})

module.exports = { requireUser, requireAdmin }
