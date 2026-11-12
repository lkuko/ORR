const config = require('../utils/config')
const { request } = require('./request')
const demo = require('./demo-store')
const { postView } = require('../utils/format')

function list() {
  if (config.useDemoData) return demo.listPosts().then(posts => posts.map(postView))
  return request('/posts').then(data => data.posts.map(postView))
}

function get(id) {
  if (config.useDemoData) return demo.getPost(id).then(postView)
  return Promise.all([request(`/posts/${id}`), request(`/posts/${id}/comments`)]).then(([data, commentData]) => {
    return postView({ ...data.post, comments: commentData.comments })
  })
}

function create(content) {
  if (config.useDemoData) return demo.createPost(content)
  return request('/posts', { method: 'POST', data: { content } }).then(data => data.post)
}

function comment(postId, content) {
  if (config.useDemoData) return demo.addComment(postId, content)
  return request(`/posts/${postId}/comments`, { method: 'POST', data: { content } }).then(data => data.comment)
}

module.exports = { list, get, create, comment }
