const path = require('node:path')
const fs = require('node:fs')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

function readDatabasePassword(source = process.env) {
  if (source.DB_PASSWORD_FILE) {
    return fs.readFileSync(source.DB_PASSWORD_FILE, 'utf8').replace(/\r?\n$/, '')
  }
  return source.DB_PASSWORD || ''
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  host: process.env.BIND_HOST || '127.0.0.1',
  trustProxy: Number(process.env.TRUST_PROXY_HOPS || 0),
  apiBasePath: process.env.API_BASE_PATH || '/api/v1',
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  allowLoopbackHttp: process.env.ALLOW_LOOPBACK_HTTP === 'true',
  appId: process.env.WECHAT_APP_ID || '',
  appSecret: process.env.WECHAT_APP_SECRET || '',
  wechatLoginMode: process.env.WECHAT_LOGIN_MODE || 'wechat',
  contentCheckMode: process.env.CONTENT_CHECK_MODE || 'wechat',
  tokenSecret: process.env.TOKEN_SECRET || '',
  adminUsername: process.env.ADMIN_USERNAME || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'campus_runner',
    user: process.env.DB_USER || 'campus_runner',
    password: readDatabasePassword(),
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10)
  }
}

function assertProductionConfig(config = env) {
  const env = config
  if (env.nodeEnv !== 'production') return
  if (env.tokenSecret.length < 32 || /replace|example/i.test(env.tokenSecret)) throw new Error('TOKEN_SECRET must be a random secret of at least 32 characters')
  const required = [
    ['TOKEN_SECRET', env.tokenSecret],
    ['WECHAT_APP_ID', env.appId],
    ['WECHAT_APP_SECRET', env.appSecret],
    ['DB_PASSWORD', env.database.password]
  ]
  const missing = required.filter(([, value]) => !value).map(([name]) => name)
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`)
  if (env.wechatLoginMode !== 'wechat' || env.contentCheckMode !== 'wechat') {
    throw new Error('Production requires WeChat login and content checking')
  }
  let origin
  try { origin = new URL(env.webOrigin) } catch (_) { throw new Error('WEB_ORIGIN must be a valid origin') }
  if (origin.origin !== env.webOrigin) throw new Error('WEB_ORIGIN must not contain credentials, a path, query or fragment')
  const internalLoopback = env.allowLoopbackHttp && origin.protocol === 'http:' && origin.hostname === '127.0.0.1'
  if (origin.protocol !== 'https:' && !internalLoopback) {
    throw new Error('Production WEB_ORIGIN must use HTTPS; internal SSH testing may explicitly allow HTTP on 127.0.0.1 only')
  }
}

module.exports = { env, assertProductionConfig, readDatabasePassword }
