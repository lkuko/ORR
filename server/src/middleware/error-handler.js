function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } })
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  const status = Number(error.status) || 500
  if (status >= 500) console.error(JSON.stringify({ requestId: req.requestId, code: error.code || error.name, message: 'request failed' }))
  res.status(status).json({
    error: {
      code: status >= 500 ? 'INTERNAL_ERROR' : error.code || 'REQUEST_FAILED',
      message: status >= 500 ? '服务暂时不可用，请稍后重试' : error.message
    }
  })
}

module.exports = { notFound, errorHandler }
