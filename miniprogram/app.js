const auth = require('./services/auth')
const { initialize } = require('./services/cloud')
App({
  onLaunch() { this.ensureLogin().catch(() => {}) },
  ensureLogin() {
    if (this.globalData.user) return Promise.resolve(this.globalData.user)
    if (this.loginPromise) return this.loginPromise
    this.loginPromise = Promise.resolve().then(initialize).then(auth.login).then(result => {
      this.globalData.user = result.user
      this.globalData.loginError = ''
      return result.user
    }).catch(error => {
      this.globalData.loginError = error.message
      throw error
    }).finally(() => { this.loginPromise = null })
    return this.loginPromise
  },
  globalData: { user: null, loginError: '' }
})
