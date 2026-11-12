const v = require('../lib/validation')
const { check } = require('../lib/errors')
const { postView, commentView } = require('../lib/views')
async function visiblePost(store, id) {
  const post = await store.get('posts', id)
  check(post && post.status === 'VISIBLE', 'POST_NOT_FOUND', '帖子不存在或已下架')
  return post
}
module.exports = {
  'forum.list': { async run(ctx) { return { posts: (await ctx.store.list('posts', { status: 'VISIBLE' })).map(postView) } }},
  'forum.get': { async run(ctx, data) {
    const id = v.id(data.id)
    const post = await visiblePost(ctx.store, id)
    const comments = await ctx.store.list('comments', { postId: id, status: 'VISIBLE' }, 'createdAt', 'asc', 200)
    return { post: postView(post), comments: comments.map(commentView) }
  }},
  'forum.create': {
    write: true, prepare: data => ({ content: v.text(data.content, 2, 2000, '帖子') }), content: data => data.content,
    async run(ctx, data) {
      const post = { id: v.hash('post', ctx.operationId), authorId: ctx.actor.id, authorNickname: ctx.actor.nickname,
        content: data.content, commentCount: 0, status: 'VISIBLE', createdAt: ctx.now }
      await ctx.store.put('posts', post.id, post)
      return { post: postView(post) }
    }
  },
  'forum.comment': {
    write: true,
    prepare: data => ({ postId: v.id(data.postId), content: v.text(data.content, 1, 500, '评论') }),
    content: data => data.content,
    async run(ctx, data) {
      const post = await visiblePost(ctx.store, data.postId)
      const comment = { id: v.hash('comment', ctx.operationId), postId: post.id, authorId: ctx.actor.id,
        authorNickname: ctx.actor.nickname, content: data.content, status: 'VISIBLE', createdAt: ctx.now }
      await ctx.store.put('comments', comment.id, comment)
      await ctx.store.put('posts', post.id, { ...post, commentCount: post.commentCount + 1 })
      return { comment: commentView(comment) }
    }
  }
}
