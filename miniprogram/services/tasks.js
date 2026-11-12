const { call, mutate } = require('./cloud')
const { taskView } = require('../utils/format')
module.exports = {
  list: (query = {}) => call('tasks.list', query).then(data => data.tasks.map(taskView)),
  listMine: role => call('tasks.mine', { role }).then(data => data.tasks.map(taskView)),
  get: id => call('tasks.get', { id }).then(data => taskView(data.task)),
  create: data => mutate('tasks.create', data).then(result => taskView(result.task)),
  action: (id, name, data = {}) => mutate('tasks.' + name, { ...data, id }).then(result => taskView(result.task)),
  messages: id => call('messages.list', { id }).then(data => data.messages),
  sendMessage: (id, content) => mutate('messages.send', { id, content }).then(data => data.message)
}
