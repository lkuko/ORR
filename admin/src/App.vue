<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { api } from './api'
import AppIcon from './components/AppIcon.vue'
import RecordId from './components/RecordId.vue'
import { typeLabel, actionLabel, statusLabel, formatTime, actionDetails } from './presentation'

const token = ref(false)
const admin = ref(null)
const tab = ref('reports')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const username = ref('')
const password = ref('')
const search = ref('')
const reports = ref([])
const cancellations = ref([])
const users = ref([])
const actions = ref([])
const reportStatus = ref('OPEN')
const restoring = ref(true)
const acting = ref(false)
const updatedAt = ref('')
const visibleActions = computed(() => [...actions.value].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))))
const currentTab = computed(() => tabs.find(item => item.id === tab.value))
const reportFilters = [{ id: 'OPEN', label: '待处理' }, { id: 'RESOLVED', label: '已处理' }, { id: 'DISMISSED', label: '不予处理' }]
let loadRequest = 0
const reasonDialog = ref(null)
const reasonField = ref(null)
const reasonTitle = ref('')
const reasonText = ref('')
const reasonError = ref('')
let resolveReason = null

async function askReason(title, initial = '') {
  if (resolveReason) return null
  reasonTitle.value = title
  reasonText.value = initial.slice(0, 300)
  reasonError.value = ''
  const answer = new Promise(resolve => { resolveReason = resolve })
  await nextTick()
  reasonDialog.value.showModal()
  reasonField.value.focus()
  return answer
}

function finishReason(confirmed) {
  const value = reasonText.value.trim()
  if (confirmed && (value.length < 2 || value.length > 300)) {
    reasonError.value = '请填写 2–300 个字符的处理说明'
    return
  }
  reasonDialog.value.close()
  const resolve = resolveReason
  resolveReason = null
  if (resolve) resolve(confirmed ? value : null)
}

const tabs = [
  { id: 'reports', label: '举报队列', description: '核对原文与举报原因，让每一条反馈都有处理结果。' },
  { id: 'cancellations', label: '取消争议', description: '查看双方的取消分歧，决定取消或恢复任务。' },
  { id: 'users', label: '用户管理', description: '查看用户状态，并为账号处置留下明确说明。' },
  { id: 'actions', label: '操作记录', description: '按时间回看处理经过、操作人和处置原因。' }
]

function message(text) {
  notice.value = text
  error.value = ''
  setTimeout(() => { notice.value = '' }, 2600)
}

async function login() {
  busy.value = true
  error.value = ''
  try {
    const result = await api.login(username.value.trim(), password.value)
    token.value = true
    admin.value = result.admin
    password.value = ''
    await loadTab()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

async function logout() {
  loadRequest++
  await api.logout().catch(() => {})
  token.value = false
  admin.value = null
  reports.value = []; cancellations.value = []; users.value = []; actions.value = []
  busy.value = false
  updatedAt.value = ''
}

async function loadTab() {
  if (!token.value) return
  const request = ++loadRequest
  const selected = tab.value
  const selectedStatus = reportStatus.value
  const query = search.value
  busy.value = true
  error.value = ''
  try {
    if (selected === 'reports') {
      const queue = (await api.reports(selectedStatus)).reports
      const result = await Promise.all(queue.map(async report => {
        try { return { ...report, target: (await api.content(report.targetType, report.targetId)).content } }
        catch (_) { return { ...report, target: null } }
      }))
      if (request === loadRequest) reports.value = result
    }
    if (selected === 'cancellations') { const result = await api.cancellations(); if (request === loadRequest) cancellations.value = result.tasks }
    if (selected === 'users') { const result = await api.users(query); if (request === loadRequest) users.value = result.users }
    if (selected === 'actions') { const result = await api.actions(); if (request === loadRequest) actions.value = result.actions }
    if (request === loadRequest) updatedAt.value = formatTime(new Date())
  } catch (err) {
    if (request !== loadRequest) return
    error.value = err.message
    if (/登录|管理员/.test(err.message)) logout()
  } finally {
    if (request === loadRequest) busy.value = false
  }
}

function selectTab(value) {
  if (tab.value === value) return
  tab.value = value
  updatedAt.value = ''
  loadTab()
}

function selectReportStatus(value) {
  if (reportStatus.value === value) return
  reportStatus.value = value
  reports.value = []
  loadTab()
}

async function hideReportedContent(report) {
  if (acting.value) return
  acting.value = true
  const reason = await askReason(report.targetType === 'USER' ? '填写封禁原因' : '填写下架原因', report.reason || '')
  if (reason === null) { acting.value = false; return }
  try {
    if (report.targetType === 'USER') await api.setUserStatus(report.targetId, 'BLOCKED', reason)
    else await api.hide(report.targetType, report.targetId, reason)
    await api.resolveReport(report.id, 'RESOLVED', reason)
    message(report.targetType === 'USER' ? '用户已封禁，举报已处理' : '内容已下架，举报已处理')
    await loadTab()
  } catch (err) { error.value = err.message } finally { acting.value = false }
}

async function dismissReport(report) {
  if (acting.value) return
  acting.value = true
  const reason = await askReason('填写不予处理的说明')
  if (reason === null) { acting.value = false; return }
  try {
    await api.resolveReport(report.id, 'DISMISSED', reason)
    message('举报已记录为不予处理')
    await loadTab()
  } catch (err) { error.value = err.message } finally { acting.value = false }
}

async function decideCancellation(task, cancelled) {
  if (acting.value) return
  acting.value = true
  const reason = await askReason(cancelled ? '填写同意取消的处理说明' : '填写恢复任务的处理说明')
  if (reason === null) { acting.value = false; return }
  try {
    await api.resolveCancellation(task.id, cancelled, reason)
    message(cancelled ? '任务已取消' : '任务已恢复')
    await loadTab()
  } catch (err) { error.value = err.message } finally { acting.value = false }
}

async function searchUsers() {
  await loadTab()
}

async function toggleUser(user) {
  if (acting.value) return
  acting.value = true
  const blocked = user.status !== 'BLOCKED'
  const reason = await askReason(blocked ? '填写封禁原因' : '填写解除封禁说明')
  if (reason === null) { acting.value = false; return }
  try {
    await api.setUserStatus(user.id, blocked ? 'BLOCKED' : 'ACTIVE', reason)
    message(blocked ? '用户已封禁' : '用户已恢复')
    await loadTab()
  } catch (err) { error.value = err.message } finally { acting.value = false }
}

onMounted(async () => {
  try {
    const session = await api.restore()
    if (session) { admin.value = session.admin; token.value = true; await loadTab() }
  } catch (err) { error.value = err.message } finally { restoring.value = false }
})
</script>

<template>
  <main v-if="restoring" class="session-loading" role="status"><span class="brand-mark">互</span><p>正在打开管理台…</p></main>
  <main v-else-if="!token" class="login-shell">
    <section class="login-intro">
      <div class="brand"><span class="brand-mark">互</span><div><strong>校园服务站</strong><small>校园互助 · 管理台</small></div></div>
      <div class="login-intro-copy"><h1>把校园里的问题<br />处理清楚。</h1><p>从一条举报到一次任务分歧，<br />认真核实，为每次处理留下依据。</p></div>
      <div class="login-scope"><span><AppIcon name="reports" />举报核实</span><span><AppIcon name="cancellations" />争议处理</span><span><AppIcon name="actions" />操作留痕</span></div>
    </section>
    <section class="login-panel"><form class="login-form" @submit.prevent="login">
      <div class="login-heading"><h2>管理员登录</h2><p>使用已授权的管理账号进入。</p></div>
      <label for="username">管理员账号<input id="username" v-model="username" autocomplete="username" placeholder="输入管理账号" required :disabled="busy" /></label>
      <label for="password">密码<input id="password" v-model="password" type="password" autocomplete="current-password" placeholder="输入密码" required :disabled="busy" /></label>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <button class="primary login-submit" :disabled="busy">{{ busy ? '正在登录…' : '进入管理台' }}<AppIcon name="arrow" /></button>
      <p class="login-note">仅供校园互助管理人员使用</p>
    </form></section>
  </main>
  <main v-else class="admin-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">互</span><div><strong>校园服务站</strong><small>校园互助 · 管理台</small></div></div>
      <nav aria-label="管理模块">
        <button v-for="item in tabs" :key="item.id" :class="{ active: tab === item.id }" :aria-current="tab === item.id ? 'page' : undefined" :disabled="acting" @click="selectTab(item.id)"><AppIcon :name="item.id" /><span>{{ item.label }}</span><AppIcon name="arrow" class="nav-arrow" /></button>
      </nav>
      <div class="sidebar-note"><AppIcon name="check" /><p>先核实，再处理。<br />每次操作都有记录可查。</p></div>
      <div class="sidebar-user"><span class="admin-avatar">管</span><div><small>当前管理员</small><strong>{{ admin?.username }}</strong></div><button class="icon-button" title="退出登录" aria-label="退出登录" :disabled="acting" @click="logout"><AppIcon name="exit" /></button></div>
    </aside>

    <section class="workspace">
      <header class="topbar"><div><h1>{{ currentTab.label }}</h1><p>{{ currentTab.description }}</p></div><button class="refresh" :disabled="busy || acting" @click="loadTab"><AppIcon name="refresh" />{{ busy ? '读取中' : '刷新列表' }}</button></header>
      <p v-if="notice" class="notice" role="status"><AppIcon name="check" />{{ notice }}</p>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <div v-if="busy" class="loading-line" role="status">正在读取数据…</div>

      <section v-if="tab === 'reports'" class="content-section" :aria-busy="busy">
        <div class="section-toolbar"><div class="filter-tabs" aria-label="举报状态"><button v-for="item in reportFilters" :key="item.id" :class="{ selected: reportStatus === item.id }" :aria-pressed="reportStatus === item.id" :disabled="acting" @click="selectReportStatus(item.id)">{{ item.label }}</button></div><span class="result-count">{{ busy ? '更新中' : reports.length + ' 条记录' }}</span></div>
        <div v-if="!reports.length && !busy && !error" class="empty-state"><span class="empty-icon"><AppIcon name="reports" /></span><h2>{{ reportStatus === 'OPEN' ? '当前没有待处理举报' : '这里还没有处理记录' }}</h2><p>{{ reportStatus === 'OPEN' ? '新的反馈会出现在这里，也可切换状态查看处理结果。' : '完成举报处置后，可在对应状态下回看处理说明。' }}</p></div>
        <div class="record-list">
          <article v-for="report in reports" :key="report.id" class="record-row">
            <div class="record-main">
              <div class="record-heading"><h2>{{ typeLabel(report.targetType) }}举报</h2><time :datetime="report.createdAt">{{ formatTime(report.createdAt) }}</time></div>
              <RecordId :value="report.targetId" :label="typeLabel(report.targetType) + '编号'" />
              <div class="reported-content"><span class="field-caption">被举报内容</span><h3 v-if="report.target?.title">{{ report.target.title }}</h3><p>{{ report.target?.content || report.targetSummary || '原内容暂时无法读取，请核实后处理。' }}</p></div>
              <dl class="record-facts"><div><dt>举报原因</dt><dd>{{ report.reason }}</dd></div><div><dt>举报人</dt><dd>{{ report.reporterNickname || '未设置昵称' }}</dd></div></dl>
              <div v-if="report.status !== 'OPEN'" class="resolution-note"><strong>处理说明</strong><p>{{ report.resolution || '暂无说明' }}</p><time>{{ formatTime(report.handledAt) }}</time></div>
            </div>
            <div class="record-actions"><span :class="['status', report.status === 'OPEN' ? 'pending' : report.status === 'RESOLVED' ? 'ok' : 'neutral']">{{ statusLabel(report.status) }}</span><template v-if="report.status === 'OPEN'"><button class="danger" :disabled="acting || busy" @click="hideReportedContent(report)">{{ report.targetType === 'USER' ? '封禁并处理' : '下架并处理' }}</button><button :disabled="acting || busy" @click="dismissReport(report)">不予处理</button></template></div>
          </article>
        </div>
      </section>

      <section v-if="tab === 'cancellations'" class="content-section" :aria-busy="busy">
        <div class="section-toolbar"><h2>等待裁定的任务</h2><span class="result-count">{{ busy ? '更新中' : cancellations.length + ' 条争议' }}</span></div>
        <div v-if="!cancellations.length && !busy && !error" class="empty-state"><span class="empty-icon"><AppIcon name="cancellations" /></span><h2>当前没有取消争议</h2><p>双方无法协商一致的取消申请，会转到这里处理。</p></div>
        <div class="record-list"><article v-for="task in cancellations" :key="task.id" class="record-row">
          <div class="record-main"><div class="record-heading"><h2>{{ task.title }}</h2></div><RecordId :value="task.id" label="订单编号" /><div class="participant-row"><div><span class="field-caption">发布者</span><strong>{{ task.ownerNickname }}</strong></div><div><span class="field-caption">接单者</span><strong>{{ task.helperNickname || '未接单' }}</strong></div><div><span class="field-caption">大致区域</span><strong>{{ task.publicArea || '未填写' }}</strong></div></div><div class="dispute-reason"><span class="field-caption">取消原因</span><p>{{ task.cancelReason }}</p></div></div>
          <div class="record-actions"><span class="status pending">待管理员处理</span><button class="danger" :disabled="acting || busy" @click="decideCancellation(task, true)">同意取消</button><button :disabled="acting || busy" @click="decideCancellation(task, false)">恢复任务</button></div>
        </article></div>
      </section>

      <section v-if="tab === 'users'" class="content-section" :aria-busy="busy">
        <div class="section-toolbar"><h2>用户名册 <span class="heading-count">{{ users.length }}</span></h2><form class="search-form" @submit.prevent="searchUsers"><label class="search-input"><AppIcon name="search" /><input v-model="search" aria-label="搜索用户昵称" placeholder="搜索昵称" /></label><button class="primary" :disabled="busy || acting">搜索</button></form></div>
        <div v-if="!users.length && !busy && !error" class="empty-state"><span class="empty-icon"><AppIcon name="users" /></span><h2>{{ search ? '没有找到匹配的用户' : '还没有用户记录' }}</h2><p>{{ search ? '试试更短的昵称关键词。' : '同学登录小程序后，会出现在名册中。' }}</p></div>
        <div v-if="users.length" class="table-wrap"><table class="user-table"><thead><tr><th scope="col">用户</th><th scope="col">账号状态</th><th scope="col">注册时间</th><th scope="col">操作</th></tr></thead><tbody>
          <tr v-for="user in users" :key="user.id"><td data-label="用户"><div class="user-identity"><span class="user-avatar">{{ (user.nickname || '同').slice(0, 1) }}</span><div><strong>{{ user.nickname }}</strong><RecordId :value="user.id" label="用户编号" /></div></div></td><td data-label="账号状态"><span :class="['status', user.status === 'ACTIVE' ? 'ok' : 'blocked']">{{ statusLabel(user.status) }}</span></td><td data-label="注册时间"><time :datetime="user.createdAt">{{ formatTime(user.createdAt) }}</time></td><td data-label="操作"><button :class="user.status === 'ACTIVE' ? 'danger' : ''" :disabled="acting || busy" @click="toggleUser(user)">{{ user.status === 'ACTIVE' ? '封禁用户' : '解除封禁' }}</button></td></tr>
        </tbody></table></div>
      </section>

      <section v-if="tab === 'actions'" class="content-section" :aria-busy="busy">
        <div class="section-toolbar"><h2>处理流水</h2><span class="result-count">{{ busy ? '更新中' : actions.length + ' 条记录，最新在前' }}</span></div>
        <div v-if="!actions.length && !busy && !error" class="empty-state"><span class="empty-icon"><AppIcon name="actions" /></span><h2>还没有操作记录</h2><p>下架、举报处理和账号处置都会在这里留痕。</p></div>
        <div v-if="actions.length" class="table-wrap"><table class="audit-table"><thead><tr><th scope="col">操作与时间</th><th scope="col">管理员</th><th scope="col">处理对象</th><th scope="col">处理说明</th></tr></thead><tbody>
          <tr v-for="action in visibleActions" :key="action.id"><td data-label="操作与时间"><strong class="audit-action">{{ actionLabel(action.action) }}</strong><time :datetime="action.createdAt">{{ formatTime(action.createdAt) }}</time></td><td data-label="管理员">{{ action.adminUsername }}</td><td data-label="处理对象"><span class="target-type">{{ typeLabel(action.targetType) }}</span><RecordId :value="action.targetId" /></td><td data-label="处理说明"><dl class="audit-details"><div v-for="(detail, index) in actionDetails(action.details)" :key="index"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div></dl><span v-if="!actionDetails(action.details).length" class="muted">暂无补充说明</span></td></tr>
        </tbody></table></div>
      </section>
      <footer class="workspace-footer"><span>校园互助 · 每次处理都有据可查</span><time v-if="updatedAt">更新于 {{ updatedAt }}</time></footer>
    </section>
  </main>
  <dialog ref="reasonDialog" class="reason-dialog" aria-labelledby="reason-title" @cancel.prevent="finishReason(false)">
    <form @submit.prevent="finishReason(true)">
      <span class="dialog-symbol"><AppIcon name="actions" /></span>
      <h2 id="reason-title">{{ reasonTitle }}</h2>
      <label for="reason-text">处理说明</label>
      <textarea id="reason-text" ref="reasonField" v-model="reasonText" rows="4" maxlength="300" aria-describedby="reason-help" placeholder="请写明核实依据和处理原因" />
      <div class="reason-hints"><p id="reason-help">填写 2–300 个字符，说明将保存到操作记录。</p><span>{{ reasonText.length }}/300</span></div>
      <p v-if="reasonError" class="error-message" role="alert">{{ reasonError }}</p>
      <div class="dialog-actions"><button type="button" @click="finishReason(false)">暂不处理</button><button type="submit" class="primary">确认处理</button></div>
    </form>
  </dialog>
</template>
