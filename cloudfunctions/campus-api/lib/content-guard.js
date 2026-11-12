const { check, AppError } = require('./errors')
function createContentGuard(cloud) {
  return async (content, openid, scene = 2) => {
    let result
    try {
      result = await cloud.openapi.security.msgSecCheck({ version: 2, scene, openid, content })
    } catch (_) { throw new AppError('CONTENT_CHECK_UNAVAILABLE', '内容检查暂时不可用，请稍后重试') }
    check(result && (result.errCode === 0 || result.errcode === 0) && result.result?.suggest === 'pass',
      'CONTENT_REJECTED', '内容未通过检查，请修改后重试')
  }
}
module.exports = { createContentGuard }
