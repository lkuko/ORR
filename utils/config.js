// Only the development build can use local demo data. No credentials belong here.
const developmentMode = 'api' // 'demo': local storage; 'api-demo': local API test accounts; 'api': real WeChat login
const endpoints = {
  develop: 'http://10.100.167.235:18080/api/v1',
  trial: 'https://staging-api.example.com/api/v1',
  release: 'https://api.example.com/api/v1'
}
let version = 'release'
try { version = wx.getAccountInfoSync().miniProgram.envVersion } catch (_) {}
module.exports = {
  useDemoData: version === 'develop' && developmentMode === 'demo',
  useDemoLogin: version === 'develop' && developmentMode === 'api-demo',
  apiBaseUrl: endpoints[version] || endpoints.release,
  envVersion: version,
  campusName: '校园互助'
}
