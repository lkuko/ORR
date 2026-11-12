const { amount } = require('./validation')
const participant = (task, userId) => task.ownerId === userId || task.helperId === userId
function userView(user) { return { id: user.id, nickname: user.nickname, status: user.status, createdAt: user.createdAt } }
function taskView(task, userId, publicOnly = false) {
  const privateAccess = !publicOnly && participant(task, userId)
  return {
    id: task.id, ownerId: task.ownerId, helperId: task.helperId,
    ownerNickname: task.ownerNickname, helperNickname: task.helperNickname,
    title: task.title, category: task.category, description: task.description,
    rewardAmount: amount(task.rewardCents), publicArea: task.publicArea,
    exactLocation: privateAccess ? task.exactLocation : null,
    canSeeExactLocation: privateAccess, deadlineAt: task.deadlineAt,
    status: task.status, visibility: task.visibility,
    createdAt: task.createdAt, updatedAt: task.updatedAt,
    cancelRequestedBy: privateAccess ? task.cancelRequestedBy : null,
    cancelReason: privateAccess ? task.cancelReason : null
  }
}
function postView(post) {
  return { id: post.id, authorId: post.authorId, authorNickname: post.authorNickname, content: post.content, commentCount: post.commentCount, createdAt: post.createdAt }
}
function commentView(comment) {
  return { id: comment.id, authorId: comment.authorId, authorNickname: comment.authorNickname, content: comment.content, createdAt: comment.createdAt }
}
function messageView(message) {
  return { id: message.id, senderId: message.senderId, senderNickname: message.senderNickname, content: message.content, createdAt: message.createdAt }
}
module.exports = { participant, userView, taskView, postView, commentView, messageView }
