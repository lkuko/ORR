const { call, mutate } = require('./cloud')
module.exports = {
  create: (targetType, targetId, reason) => mutate('reports.create', { targetType, targetId, reason }),
  mine: () => call('reports.mine').then(data => data.reports)
}
