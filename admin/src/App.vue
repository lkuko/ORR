<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { api } from './api'

const token = ref(localStorage.getItem('adminToken') || '')
const admin = ref(JSON.parse(localStorage.getItem('adminProfile') || 'null'))
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
const visibleReports = computed(() => reports.value)
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
  { id: 'reports', label: '举报队列' },
  { id: 'cancellations', label: '取消争议' },
  { id: 'users', label: '用户管理' },
  { id: 'actions', label: '操作记录' }
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
    token.value = result.token
    admin.value = result.admin
    localStorage.setItem('adminToken', result.token)
    localStorage.setItem('adminProfile', JSON.stringify(result.admin))
    password.value = ''
    await loadTab()
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

function logout() {
  token.value = ''
  admin.value = null
  localStorage.removeItem('adminToken')
  localStorage.removeItem('adminProfile')
}

async function loadTab() {
  if (!token.value) return
  busy.value = true
  error.value = ''
  try {
    if (tab.value === 'reports') {
      const queue = (await api.reports('OPEN')).reports
      reports.value = await Promise.all(queue.map(async report => {
        try { return { ...report, target: (await api.content(report.targetType, report.targetId)).content } }
        catch (_) { return { ...report, target: null } }
      }))
    }
    if (tab.value === 'cancellations') cancellations.value = (await api.cancellations()).tasks
    if (tab.value === 'users') users.value = (await api.users(search.value)).users
    if (tab.value === 'actions') actions.value = (await api.actions()).actions
  } catch (err) {
    error.value = err.message
    if (/登录|管理员/.test(err.message)) logout()
  } finally {
    busy.value = false
  }
}

function selectTab(value) {
  tab.value = value
  loadTab()
}

async function hideReportedContent(report) {
  const reason = await askReason(report.targetType === 'USER' ? '填写封禁原因' : '填写下架原因', report.reason || '')
  if (reason === null) return
  try {
    if (report.targetType === 'USER') await api.setUserStatus(report.targetId, 'BLOCKED', reason)
    else await api.hide(report.targetType, report.targetId, reason)
    await api.resolveReport(report.id, 'RESOLVED', reason)
    message('内容已下架，举报已处理')
    await loadTab()
  } catch (err) { error.value = err.message }
}

async function dismissReport(report) {
  const reason = await askReason('填写不予处理的说明')
  if (reason === null) return
  try {
    await api.resolveReport(report.id, 'DISMISSED', reason)
    message('举报已记录为不予处理')
    await loadTab()
  } catch (err) { error.value = err.message }
}

async function decideCancellation(task, cancelled) {
  const reason = await askReason(cancelled ? '填写同意取消的处理说明' : '填写拒绝取消的处理说明')
  if (reason === null) return
  try {
    await api.resolveCancellation(task.id, cancelled, reason)
    message(cancelled ? '任务已取消' : '任务已恢复')
    await loadTab()
  } catch (err) { error.value = err.message }
}

async function searchUsers() {
  try { users.value = (await api.users(search.value)).users }
  catch (err) { error.value = err.message }
}

async function toggleUser(user) {
  const blocked = user.status !== 'BLOCKED'
  const reason = await askReason(blocked ? '填写封禁原因' : '填写解除封禁说明')
  if (reason === null) return
  try {
    await api.setUserStatus(user.id, blocked ? 'BLOCKED' : 'ACTIVE', reason)
    message(blocked ? '用户已封禁' : '用户已恢复')
    await loadTab()
  } catch (err) { error.value = err.message }
}

onMounted(loadTab)
</script>

<template>
  <main v-if="!token" class="login-shell">
    <form class="login-form" @submit.prevent="login">
      <p class="eyebrow">CAMPUS MUTUAL AID</p>
      <h1>管理后台</h1>
      <label>管理员账号<input v-model="username" autocomplete="username" required /></label>
      <label>密码<input v-model="password" type="password" autocomplete="current-password" required /></label>
      <p v-if="error" class="error-message">{{ error }}</p>
      <button class="primary" :disabled="busy">{{ busy ? '正在登录…' : '登录' }}</button>
    </form>
  </main>
  <main v-else class="admin-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">互</span><div><strong>校园互助</strong><small>运营管理</small></div></div>
      <nav aria-label="管理模块">
        <button v-for="item in tabs" :key="item.id" :class="{ active: tab === item.id }" @click="selectTab(item.id)">{{ item.label }}</button>
      </nav>
      <div class="sidebar-user"><span>{{ admin?.username }}</span><button @click="logout">退出</button></div>
    </aside>

    <section class="workspace">
      <header class="topbar"><div><p class="eyebrow">校园跑腿与论坛</p><h1>{{ tabs.find(item => item.id === tab)?.label }}</h1></div><button class="refresh" :disabled="busy" @click="loadTab">刷新</button></header>
      <p v-if="notice" class="notice">{{ notice }}</p>
      <p v-if="error" class="error-banner">{{ error }}</p>
      <div v-if="busy" class="loading-line">正在读取数据…</div>

      <section v-if="tab === 'reports'" class="content-section">
        <div class="section-toolbar"><h2>待处理举报</h2><span>{{ visibleReports.length }} 条</span></div>
        <div v-if="!visibleReports.length && !busy" class="empty-state">当前没有待处理举报</div>
        <div v-for="report in visibleReports" :key="report.id" class="record-row">
          <div class="record-main"><div class="record-meta"><strong>{{ report.targetType }} #{{ report.targetId }}</strong><span>举报人：{{ report.reporterNickname }}</span><time>{{ report.createdAt }}</time></div><p class="reported-content">{{ report.target?.content || '举报对象已不存在' }}</p><p>举报原因：{{ report.reason }}</p></div>
          <div class="record-actions"><button class="danger" @click="hideReportedContent(report)">{{ report.targetType === 'USER' ? '封禁并处理' : '下架并处理' }}</button><button @click="dismissReport(report)">不予处理</button></div>
        </div>
      </section>

      <section v-if="tab === 'cancellations'" class="content-section">
        <div class="section-toolbar"><h2>待管理员处理的取消申请</h2><span>{{ cancellations.length }} 条</span></div>
        <div v-if="!cancellations.length && !busy" class="empty-state">当前没有取消争议</div>
        <div v-for="task in cancellations" :key="task.id" class="record-row">
          <div class="record-main"><div class="record-meta"><strong>{{ task.title }} · #{{ task.id }}</strong><span>发布者：{{ task.ownerNickname }}</span><span>接单者：{{ task.helperNickname }}</span></div><p>申请原因：{{ task.cancelReason }}</p></div>
          <div class="record-actions"><button class="danger" @click="decideCancellation(task, true)">同意取消</button><button @click="decideCancellation(task, false)">恢复任务</button></div>
        </div>
      </section>

      <section v-if="tab === 'users'" class="content-section">
        <div class="section-toolbar"><h2>用户</h2><form class="search-form" @submit.prevent="searchUsers"><input v-model="search" placeholder="搜索昵称" /><button>搜索</button></form></div>
        <div class="table-wrap"><table><thead><tr><th>用户</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead><tbody>
          <tr v-for="user in users" :key="user.id"><td>{{ user.nickname }} <small>#{{ user.id }}</small></td><td><span :class="['status', user.status === 'ACTIVE' ? 'ok' : 'blocked']">{{ user.status === 'ACTIVE' ? '正常' : '已封禁' }}</span></td><td>{{ user.createdAt }}</td><td><button :class="user.status === 'ACTIVE' ? 'danger' : ''" @click="toggleUser(user)">{{ user.status === 'ACTIVE' ? '封禁' : '解除封禁' }}</button></td></tr>
        </tbody></table></div>
      </section>

      <section v-if="tab === 'actions'" class="content-section">
        <div class="section-toolbar"><h2>管理员操作记录</h2><span>{{ actions.length }} 条</span></div>
        <div class="table-wrap"><table><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>对象</th><th>详情</th></tr></thead><tbody>
          <tr v-for="action in actions" :key="action.id"><td>{{ action.createdAt }}</td><td>{{ action.adminUsername }}</td><td>{{ action.action }}</td><td>{{ action.targetType }} #{{ action.targetId }}</td><td>{{ JSON.stringify(action.details) }}</td></tr>
        </tbody></table></div>
      </section>
    </section>
  </main>
  <dialog ref="reasonDialog" class="reason-dialog" aria-labelledby="reason-title" @cancel.prevent="finishReason(false)">
    <form @submit.prevent="finishReason(true)">
      <h2 id="reason-title">{{ reasonTitle }}</h2>
      <label for="reason-text">处理说明</label>
      <textarea id="reason-text" ref="reasonField" v-model="reasonText" rows="4" maxlength="300" aria-describedby="reason-help" />
      <p id="reason-help" class="reason-help">填写 2–300 个字符，说明将保存到操作记录。</p>
      <p v-if="reasonError" class="error-message" role="alert">{{ reasonError }}</p>
      <div class="dialog-actions"><button type="button" @click="finishReason(false)">取消</button><button type="submit" class="primary">确认处理</button></div>
    </form>
  </dialog>
</template>
