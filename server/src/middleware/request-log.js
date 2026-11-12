const { randomUUID } = require('node:crypto')

function requestLog(req, res, next) {
  req.requestId = randomUUID()
  const started = process.hrtime.bigint()
  res.set('x-request-id', req.requestId)
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return
    console.log(JSON.stringify({ time: new Date().toISOString(), requestId: req.requestId, method: req.method, path: req.route?.path || req.path.replace(/\/[0-9]+/g, '/:id'), status: res.statusCode, durationMs: Number(process.hrtime.bigint() - started) / 1e6 }))
  })
  next()
}
module.exports = { requestLog }
