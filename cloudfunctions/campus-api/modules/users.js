const v = require('../lib/validation')
const { userView } = require('../lib/views')
module.exports = {
  'users.profile': {
    write: true,
    prepare: data => ({ nickname: v.text(data.nickname, 1, 40, '昵称') }),
    content: data => data.nickname,
    scene: 1,
    async run(ctx, data) {
      const user = { ...ctx.actor, nickname: data.nickname, updatedAt: ctx.now }
      await ctx.store.put('users', user.id, user)
      return { user: userView(user) }
    }
  }
}
