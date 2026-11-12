const express = require('express')
const { requireUser } = require('../../middleware/authenticate')
const { asyncRoute } = require('../../lib/errors')
const service = require('./service')

const router = express.Router()
router.use(requireUser)
router.param('taskId', require('../../lib/validation').idParam)

router.get('/', asyncRoute(async (req, res) => {
  res.json({ tasks: await service.list(req.query, req.user.id) })
}))

router.get('/mine', asyncRoute(async (req, res) => {
  res.json({ tasks: await service.listMine(req.user.id, req.query.role) })
}))

router.post('/', asyncRoute(async (req, res) => {
  res.status(201).json({ task: await service.create(req.user, req.body) })
}))

router.get('/:taskId', asyncRoute(async (req, res) => {
  res.json({ task: await service.get(req.params.taskId, req.user.id) })
}))

router.post('/:taskId/accept', asyncRoute(async (req, res) => {
  res.json({ task: await service.transition(req.params.taskId, req.user.id, 'accept') })
}))

router.post('/:taskId/complete', asyncRoute(async (req, res) => {
  res.json({ task: await service.transition(req.params.taskId, req.user.id, 'complete') })
}))

router.post('/:taskId/confirm', asyncRoute(async (req, res) => {
  res.json({ task: await service.transition(req.params.taskId, req.user.id, 'confirm') })
}))

router.post('/:taskId/cancel', asyncRoute(async (req, res) => {
  res.json({ task: await service.transition(req.params.taskId, req.user.id, 'cancel-open') })
}))

router.post('/:taskId/cancel-request', asyncRoute(async (req, res) => {
  res.json({ task: await service.requestCancellation(req.params.taskId, req.user.id, req.body.reason) })
}))

router.post('/:taskId/cancel-confirm', asyncRoute(async (req, res) => {
  res.json({ task: await service.decideCancellation(req.params.taskId, req.user.id, req.body.accepted) })
}))

router.get('/:taskId/messages', asyncRoute(async (req, res) => {
  res.json({ messages: await service.listMessages(req.params.taskId, req.user.id) })
}))

router.post('/:taskId/messages', asyncRoute(async (req, res) => {
  res.status(201).json(await service.sendMessage(req.params.taskId, req.user, req.body.content))
}))

module.exports = router
