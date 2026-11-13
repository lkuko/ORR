const types = { TASK: '任务', POST: '帖子', COMMENT: '评论', USER: '用户', PRODUCT: '商品', PRODUCT_ORDER: '商品交易', REPORT: '举报' }
const actions = { CONTENT_HIDDEN: '内容下架', PRODUCT_HIDDEN: '商品下架', PRODUCT_ORDER_RESOLVED: '商品交易裁定', REPORT_RESOLVED: '举报结案', CANCELLATION_RESOLVED: '取消争议处理', USER_BLOCKED: '封禁用户', USER_RESTORED: '解除封禁' }
const statuses = { OPEN: '待处理', RESOLVED: '已处理', DISMISSED: '不予处理', ACTIVE: '正常', BLOCKED: '已封禁', ASSIGNED: '进行中', COMPLETION_PENDING: '待确认完成', CANCEL_PENDING: '取消协商中', DISPUTED: '待管理员裁定', AVAILABLE: '在售', RESERVED: '已预约', WITHDRAWN: '已下架', SOLD: '已售出', COMPLETED: '已完成', CANCELLED: '已取消', PENDING: '待确认预约', ACCEPTED: '待当面交付' }
export const typeLabel = value => types[value] || value || '内容'
export const actionLabel = value => actions[value] || value || '操作'
export const statusLabel = value => statuses[value] || value || '—'
export const shortId = value => { const id = String(value || ''); return id.length > 16 ? id.slice(0, 6) + '…' + id.slice(-6) : id }
export function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
export function actionDetails(details) {
  if (!details || typeof details !== 'object') return []
  const labels = { reason: '处理说明', resolution: '处理说明', status: '处理结果', cancelled: '裁定结果' }
  return Object.entries(details).map(([key, value]) => ({
    label: labels[key] || key,
    value: key === 'cancelled' ? (value ? '同意取消' : '恢复任务') : key === 'status' ? statusLabel(value) : typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')
  }))
}
