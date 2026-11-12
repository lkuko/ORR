const auth = require('./services/auth')

App({
  onLaunch() {
    this.ensureLogin().catch(() => {})
  },
  ensureLogin() {
    if (this.globalData.user) return Promise.resolve(this.globalData.user)
    if (this.loginPromise) return this.loginPromise
    this.loginPromise = auth.login().then(result => {
      this.globalData.user = result.user
      this.globalData.token = result.token
      this.loginPromise = null
      return result.user
    }).catch(error => {
      this.loginPromise = null
      this.globalData.loginError = error.message
      throw error
    })
    return this.loginPromise
  },
  globalData: {
    user: null,
    token: '',
    loginError: ''
  }
})
