const express = require('express')
const { getPool } = require('../../db/pool')
const { requireUser } = require('../../middleware/authenticate')
const { asyncRoute, HttpError } = require('../../lib/errors')
const { checkText } = require('../../lib/content-guard')

const router = express.Router()
router.use(requireUser)
router.param('postId', require('../../lib/validation').idParam)

router.get('/', asyncRoute(async (req, res) => {
  const [posts] = await getPool().execute(
    `SELECT p.id, p.author_id AS authorId, u.nickname AS authorNickname, p.content,
      p.created_at AS createdAt,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'VISIBLE') AS commentCount
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.status = 'VISIBLE' ORDER BY p.created_at DESC LIMIT 100`
  )
  res.json({ posts })
}))

router.get('/:postId', asyncRoute(async (req, res) => {
  const [rows] = await getPool().execute(`SELECT p.id, p.author_id AS authorId, u.nickname AS authorNickname, p.content, p.created_at AS createdAt FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ? AND p.status = 'VISIBLE'`, [req.params.postId])
  if (!rows[0]) throw new HttpError(404, '帖子不存在或已下架', 'POST_NOT_FOUND')
  res.json({ post: rows[0] })
}))

router.post('/', asyncRoute(async (req, res) => {
  const content = String(req.body.content || '').trim()
  if (content.length < 2 || content.length > 2000) throw new HttpError(400, '帖子需为 2–2000 个字符', 'INVALID_POST')
  await checkText(content, req.user.openid)
  const [result] = await getPool().execute('INSERT INTO posts (author_id, content) VALUES (?, ?)', [req.user.id, content])
  res.status(201).json({ post: { id: result.insertId, authorId: req.user.id, authorNickname: req.user.nickname, content, commentCount: 0 } })
}))

router.get('/:postId/comments', asyncRoute(async (req, res) => {
  const [posts] = await getPool().execute('SELECT id FROM posts WHERE id = ? AND status = \'VISIBLE\'', [req.params.postId])
  if (!posts[0]) throw new HttpError(404, '帖子不存在', 'POST_NOT_FOUND')
  const [comments] = await getPool().execute(
    `SELECT c.id, c.author_id AS authorId, u.nickname AS authorNickname, c.content, c.created_at AS createdAt
     FROM comments c JOIN users u ON u.id = c.author_id
     WHERE c.post_id = ? AND c.status = 'VISIBLE' ORDER BY c.created_at ASC LIMIT 200`,
    [req.params.postId]
  )
  res.json({ comments })
}))

router.post('/:postId/comments', asyncRoute(async (req, res) => {
  const content = String(req.body.content || '').trim()
  if (content.length < 1 || content.length > 500) throw new HttpError(400, '评论需为 1–500 个字符', 'INVALID_COMMENT')
  const [posts] = await getPool().execute('SELECT id FROM posts WHERE id = ? AND status = \'VISIBLE\'', [req.params.postId])
  if (!posts[0]) throw new HttpError(404, '帖子不存在', 'POST_NOT_FOUND')
  await checkText(content, req.user.openid)
  const [result] = await getPool().execute('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)', [req.params.postId, req.user.id, content])
  res.status(201).json({ comment: { id: result.insertId, authorId: req.user.id, authorNickname: req.user.nickname, content } })
}))

module.exports = router
