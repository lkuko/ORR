const { createHash } = require('node:crypto')
const { check } = require('./errors')
function text(value, min, max, label) {
  check(typeof value === 'string', 'INVALID_INPUT', label + '格式不正确')
  const result = value.trim()
  check(result.length >= min && result.length <= max, 'INVALID_INPUT', label + '需为 ' + min + '–' + max + ' 个字符')
  return result
}
function id(value) {
  check(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value), 'INVALID_ID', '标识格式不正确')
  return value
}
function bool(value) { check(typeof value === 'boolean', 'INVALID_INPUT', '请选择处理结果'); return value }
function money(value) {
  if (value === null || value === undefined || value === '') return null
  check(typeof value === 'string' || typeof value === 'number', 'INVALID_REWARD', '金额格式不正确')
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(String(value))
  check(Boolean(match), 'INVALID_REWARD', '金额最多保留两位小数')
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'))
}
function amount(cents) { return cents == null ? null : Math.floor(cents / 100) + '.' + String(cents % 100).padStart(2, '0') }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  return JSON.stringify(value)
}
const hash = (...parts) => createHash('sha256').update(parts.join('\0')).digest('hex')
module.exports = { text, id, bool, money, amount, canonical, hash }
