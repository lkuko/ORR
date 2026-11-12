const { HttpError } = require('./errors')
function idParam(req, res, next, value) {
  if (!/^[1-9]\d{0,14}$/.test(String(value))) return next(new HttpError(400, '编号无效', 'INVALID_ID'))
  next()
}
function reason(value) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 500) throw new HttpError(400, '请填写 2–500 字的处理原因', 'INVALID_REASON')
  return value.trim()
}
module.exports = { idParam, reason }
