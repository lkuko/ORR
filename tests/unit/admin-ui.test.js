const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
async function adminPage(api) {
  const presentation = await import('../../admin/src/presentation.js')
  const file = fs.readFileSync(require.resolve('../../admin/src/App.vue'), 'utf8')
  const source = file.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+$/gm, '')
  const context = { api, ...presentation, ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }), nextTick: () => Promise.resolve(), onMounted: () => {}, setTimeout: () => 0, console }
  vm.createContext(context)
  vm.runInContext(source + '\nthis.page = { token, tab, reportStatus, reports, busy, acting, reasonDialog, reasonField, reasonText, loadTab, selectTab, selectReportStatus, hideReportedContent, finishReason }', context)
  return context.page
}

test('admin report filters discard a slower response for the previous status', async () => {
  const reads = []
  const page = await adminPage({ reports: status => { const read = { status, ...deferred() }; reads.push(read); return read.promise }, content: async () => ({ content: { content: '原文' } }) })
  page.token.value = true
  const old = page.loadTab()
  page.selectReportStatus('RESOLVED')
  reads[1].resolve({ reports: [{ id: 'new', targetType: 'POST', targetId: 'post-new' }] })
  await new Promise(resolve => setImmediate(resolve))
  reads[0].resolve({ reports: [{ id: 'old', targetType: 'POST', targetId: 'post-old' }] })
  await old
  assert.equal(page.reports.value[0].id, 'new')
  assert.equal(page.busy.value, false)
})

test('admin moderation locks repeat clicks from dialog through request completion and permits cancellation', async () => {
  let dialogs = 0, hides = 0, resolves = 0
  const pending = deferred()
  const page = await adminPage({ hide: async () => { hides++; await pending.promise }, resolveReport: async () => { resolves++ }, reports: async () => ({ reports: [] }) })
  page.reasonDialog.value = { showModal() { dialogs++ }, close() {} }
  page.reasonField.value = { focus() {} }
  const report = { id: 'report', targetType: 'COMMENT', targetId: 'comment', reason: '重复内容' }
  const first = page.hideReportedContent(report)
  await Promise.resolve()
  await page.hideReportedContent(report)
  assert.equal(dialogs, 1)
  page.finishReason(true)
  await Promise.resolve()
  await page.hideReportedContent(report)
  assert.equal(hides, 1)
  assert.equal(page.acting.value, true)
  pending.resolve()
  await first
  assert.equal(resolves, 1)
  assert.equal(page.acting.value, false)
  const cancelled = page.hideReportedContent(report)
  await Promise.resolve()
  page.finishReason(false)
  await cancelled
  assert.equal(hides, 1)
  assert.equal(page.acting.value, false)
})

test('admin audit presentation distinguishes restore from cancellation and displays China time', async () => {
  const { actionDetails, formatTime, shortId } = await import('../../admin/src/presentation.js')
  assert.deepEqual(actionDetails({ cancelled: false, reason: '双方继续履行' }), [{ label: '裁定结果', value: '恢复任务' }, { label: '处理说明', value: '双方继续履行' }])
  assert.equal(actionDetails({ cancelled: true })[0].value, '同意取消')
  assert.equal(actionDetails({ status: 'DISMISSED' })[0].value, '不予处理')
  assert.match(formatTime('2026-11-12T08:04:00Z'), /16:04/)
  assert.equal(shortId('a'.repeat(64)), 'aaaaaa…aaaaaa')
})
