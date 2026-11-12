const { call, mutate } = require('./cloud')
module.exports = {
  login: () => call('users.login'),
  updateNickname: nickname => mutate('users.profile', { nickname })
}
