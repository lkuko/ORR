class AppError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
function fail(code, message) { throw new AppError(code, message) }
function check(condition, code, message) { if (!condition) fail(code, message) }
module.exports = { AppError, fail, check }
