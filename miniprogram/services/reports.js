const { call, mutate } = require('./cloud')
module.exports = {
  create: (targetType, targetId, reason) => mutate('reports.create', { targetType, targetId, reason }),
  mine: (query = {}) => call('reports.mine', query).then(data => data.reports),
  minePage: (query = {}) => call('reports.mine', query),
  archive: (ids, days) => mutate('reports.archive', { ids, days }),
  restore: id => mutate('reports.restore', { id }),
  clear: ids => mutate('reports.clear', { ids })
}
