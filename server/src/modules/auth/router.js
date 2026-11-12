const express = require('express')
const { getPool } = require('../../db/pool')
const { env } = require('../../config/env')
const { signToken } = require('../../lib/tokens')
const { verifyPassword } = require('../../lib/passwords')
const { HttpError, asyncRoute } = require('../../lib/errors')
const { requireUser } = require('../../middleware/authenticate')
const { checkText } = require('../../lib/content-guard')

const router = express.Router()

function cleanNickname(value) {
  const nickname = String(value || '').trim().slice(0, 40)
  return nickname || `同学${Math.floor(1000 + Math.random() * 9000)}`
}

async function exchangeCode(code) {
  if (code.startsWith('demo:')) {
    if (env.wechatLoginMode !== 'demo' || !['development', 'test'].includes(env.nodeEnv)) {
      throw new HttpError(401, '当前环境不允许测试账号登录', 'DEMO_LOGIN_DISABLED')
    }
    return { openid: `demo:${code.slice(5)}` }
  }
  if (!env.appId || !env.appSecret) throw new HttpError(503, '微信登录尚未配置', 'WECHAT_LOGIN_UNAVAILABLE')
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.searchParams.set('appid', env.appId)
  url.searchParams.set('secret', env.appSecret)
  url.searchParams.set('js_code', code)
  url.searchParams.set('grant_type', 'authorization_code')
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const data = await response.json()
  if (!response.ok || data.errcode || !data.openid) throw new HttpError(401, '微信登录失败，请重试', 'WECHAT_LOGIN_FAILED')
  return data
}

router.post('/wechat-login', asyncRoute(async (req, res) => {
  const code = String(req.body.code || '').trim()
  if (!code || code.length > 256) throw new HttpError(400, '登录凭证无效', 'INVALID_CODE')
  const identity = await exchangeCode(code)
  const nickname = cleanNickname('')
  const pool = getPool()
  await pool.execute(
    `INSERT INTO users (openid, nickname) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE nickname = IF(nickname = '', VALUES(nickname), nickname), updated_at = CURRENT_TIMESTAMP`,
    [identity.openid, nickname]
  )
  const [rows] = await pool.execute('SELECT id, nickname, status FROM users WHERE openid = ?', [identity.openid])
  if (rows[0].status !== 'ACTIVE') throw new HttpError(403, '账号不可用', 'ACCOUNT_BLOCKED')
  const token = signToken({ sub: rows[0].id, role: 'user' }, env.tokenSecret)
  res.json({ token, user: { id: rows[0].id, nickname: rows[0].nickname } })
}))

router.post('/admin-login', asyncRoute(async (req, res) => {
  const username = String(req.body.username || '').trim()
  const password = String(req.body.password || '')
  if (username.length > 80 || password.length > 256) throw new HttpError(400, '账号或密码长度无效', 'INVALID_CREDENTIALS')
  const [rows] = await getPool().execute('SELECT id, username, password_hash, status FROM admin_users WHERE username = ?', [username])
  const admin = rows[0]
  if (!admin || admin.status !== 'ACTIVE' || !(await verifyPassword(password, admin.password_hash))) {
    throw new HttpError(401, '账号或密码不正确', 'INVALID_CREDENTIALS')
  }
  const token = signToken({ sub: admin.id, role: 'admin' }, env.tokenSecret, 60 * 60 * 8)
  res.json({ token, admin: { id: admin.id, username: admin.username } })
}))

router.patch('/profile', requireUser, asyncRoute(async (req, res) => {
  const nickname = String(req.body.nickname || '').trim()
  if (nickname.length < 1 || nickname.length > 40) throw new HttpError(400, '昵称需为 1–40 个字符', 'INVALID_NICKNAME')
  await checkText(nickname, req.user.openid)
  await getPool().execute('UPDATE users SET nickname = ? WHERE id = ?', [nickname, req.user.id])
  res.json({ user: { id: req.user.id, nickname } })
}))

module.exports = router
