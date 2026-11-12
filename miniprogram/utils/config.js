const environments = require('./environments.local.js')
let version = 'release'
try { version = wx.getAccountInfoSync().miniProgram.envVersion } catch (_) {}
const value = environments[version]
const cloudEnv = typeof value === 'string' && !value.trim().startsWith('YOUR_') ? value.trim() : ''
module.exports = { envVersion: version, cloudEnv, functionName: 'campus-api', campusName: '校园互助' }
