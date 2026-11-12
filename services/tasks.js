const config = require('../utils/config')
const { request } = require('./request')
const demo = require('./demo-store')
const { taskView } = require('../utils/format')

function list(query = {}) {
  if (config.useDemoData) return demo.listTasks(query).then(items => items.map(taskView))
  const params = []
  if (query.category && query.category !== 'ALL') params.push(`category=${encodeURIComponent(query.category)}`)
  return request(`/tasks${params.length ? `?${params.join('&')}` : ''}`).then(data => data.tasks.map(taskView))
}

function listMine(role) {
  if (config.useDemoData) return demo.listMine(role).then(items => items.map(taskView))
  return request(`/tasks/mine?role=${role}`).then(data => data.tasks.map(taskView))
}

function get(id) {
  if (config.useDemoData) return demo.getTask(id).then(taskView)
  return request(`/tasks/${id}`).then(data => taskView({ ...data.task, canSeeExactLocation: Boolean(data.task.exactLocation) }))
}

function create(data) {
  if (config.useDemoData) return demo.createTask(data).then(taskView)
  return request('/tasks', { method: 'POST', data }).then(result => taskView(result.task))
}

function action(id, name, data = {}) {
  if (config.useDemoData) return demo.changeTask(id, name, data)
  const paths = {
    accept: `/tasks/${id}/accept`,
    complete: `/tasks/${id}/complete`,
    confirm: `/tasks/${id}/confirm`,
    cancel: `/tasks/${id}/cancel`,
    'cancel-request': `/tasks/${id}/cancel-request`,
    'cancel-confirm': `/tasks/${id}/cancel-confirm`
  }
  return request(paths[name], { method: 'POST', data }).then(result => taskView(result.task))
}

function messages(id) {
  if (config.useDemoData) return demo.listMessages(id)
  return request(`/tasks/${id}/messages`).then(data => data.messages)
}

function sendMessage(id, content) {
  if (config.useDemoData) return demo.sendMessage(id, content)
  return request(`/tasks/${id}/messages`, { method: 'POST', data: { content } })
}

module.exports = { list, listMine, get, create, action, messages, sendMessage }
