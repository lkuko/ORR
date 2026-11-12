class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message)
    this.status = status
    this.code = code
  }
}

function asyncRoute(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

module.exports = { HttpError, asyncRoute }
