const cloud = require('wx-server-sdk')
const cloudbase = require('@cloudbase/node-sdk')
const { createStore } = require('./lib/store')
const { createContentGuard } = require('./lib/content-guard')
const { createHandler } = require('./app')
const { createMediaGateway } = require('./lib/media')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, throwOnNotFound: false })
const web = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const handle = createHandler({
  store: createStore(cloud.database()),
  checkText: createContentGuard(cloud),
  media: createMediaGateway(cloud),
  logger: metrics => console.info(JSON.stringify(metrics))
})
exports.main = async event => {
  // Never read identity/role from event, event.data or unverified HTTP headers.
  const wxContext = cloud.getWXContext()
  const webContext = web.auth().getUserInfo()
  return handle(event, {
    openid: wxContext.OPENID, appid: wxContext.APPID,
    uid: webContext.uid, anonymous: webContext.isAnonymous
  })
}
