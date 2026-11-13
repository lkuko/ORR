const { call, mutate } = require('./cloud')
const { taskView } = require('../utils/format')
module.exports = {
  list: (query = {}) => call('tasks.list', query).then(data => data.tasks.map(taskView)),
  listMine: (role, query = {}) => call('tasks.mine', { ...query, role }).then(data => data.tasks.map(taskView)),
  minePage: query => call('tasks.mine', query).then(data => ({ ...data, tasks: data.tasks.map(taskView) })),
  archive: (ids, days) => mutate('tasks.archive', { ids, days }),
  restore: id => mutate('tasks.restore', { id }).then(data => taskView(data.task)),
  clear: ids => mutate('tasks.clear', { ids }),
  get: id => call('tasks.get', { id }).then(data => taskView(data.task)),
  create: data => mutate('tasks.create', data).then(result => taskView(result.task)),
  action: (id, name, data = {}) => mutate('tasks.' + name, { ...data, id }).then(result => taskView(result.task)),
  messages: id => call('messages.list', { id }).then(data => data.messages),
  sendMessage: (id, content) => mutate('messages.send', { id, content }).then(data => data.message)
}
