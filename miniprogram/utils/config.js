// Environment IDs are public configuration, never credentials.
const environments = { develop: 'orr-d0gvuc3liba01ebf1', trial: 'orr-d0gvuc3liba01ebf1', release: '' }
let version = 'release'
try { version = wx.getAccountInfoSync().miniProgram.envVersion } catch (_) {}
module.exports = { envVersion: version, cloudEnv: environments[version] || '', functionName: 'campus-api', campusName: '校园互助' }
