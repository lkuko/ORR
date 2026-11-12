const { env } = require('../config/env')
const { HttpError } = require('./errors')

let accessTokenCache = { value: '', expiresAt: 0 }

async function getAccessToken() {
  if (accessTokenCache.value && accessTokenCache.expiresAt > Date.now() + 60_000) return accessTokenCache.value
  const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ grant_type: 'client_credential', appid: env.appId, secret: env.appSecret, force_refresh: false })
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new HttpError(503, '内容安全服务暂时不可用', 'CONTENT_CHECK_UNAVAILABLE')
  accessTokenCache = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 7200) * 1000 }
  return accessTokenCache.value
}

async function checkText(content, openid) {
  if (env.contentCheckMode === 'disabled' && env.nodeEnv !== 'production') return
  if (!env.appId || !env.appSecret || !openid) {
    throw new HttpError(503, '内容安全检查尚未配置', 'CONTENT_CHECK_UNAVAILABLE')
  }
  const url = new URL('https://api.weixin.qq.com/wxa/msg_sec_check')
  url.searchParams.set('access_token', await getAccessToken())
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ content, version: 2, scene: 2, openid })
  })
  const data = await response.json()
  if (!response.ok || data.errcode) throw new HttpError(503, '内容安全检查失败，请稍后重试', 'CONTENT_CHECK_UNAVAILABLE')
  if (data.result?.suggest !== 'pass') {
    throw new HttpError(422, '内容未通过安全检查，请修改后重试', 'CONTENT_REJECTED')
  }
}

module.exports = { checkText }
