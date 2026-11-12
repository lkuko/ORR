const { call, mutate } = require('./cloud')
const { postView } = require('../utils/format')
module.exports = {
  list: () => call('forum.list').then(data => data.posts.map(postView)),
  get: id => call('forum.get', { id }).then(data => postView({ ...data.post, comments: data.comments })),
  create: content => mutate('forum.create', { content }).then(data => data.post),
  comment: (postId, content) => mutate('forum.comment', { postId, content }).then(data => data.comment)
}
