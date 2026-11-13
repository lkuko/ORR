const { dateTime, shortId } = require('./format')
const categories = [{ value: 'ALL', label: '全部' }, { value: 'BOOKS', label: '书籍教材' }, { value: 'DIGITAL', label: '数码电子' },
  { value: 'DAILY', label: '生活用品' }, { value: 'SPORTS', label: '运动户外' }, { value: 'CLOTHING', label: '服饰配件' }, { value: 'OTHER', label: '其他闲置' }]
const conditions = [{ value: 'NEW', label: '全新' }, { value: 'LIKE_NEW', label: '几乎全新' }, { value: 'GOOD', label: '正常使用' }, { value: 'FAIR', label: '有使用痕迹' }]
const statuses = { AVAILABLE: '在售', RESERVED: '已预约', SOLD: '已售出', WITHDRAWN: '已下架', PENDING: '待卖家确认', ACCEPTED: '待当面交付',
  COMPLETED: '交易完成', CANCEL_PENDING: '取消协商中', DISPUTED: '待管理员处理', CANCELLED: '已取消' }
function productView(item) {
  return { ...item, categoryLabel: categories.find(x => x.value === item.category)?.label || '',
    conditionLabel: conditions.find(x => x.value === item.condition)?.label || '', statusLabel: item.visibility === 'HIDDEN' ? '管理下架' : statuses[item.status] || '',
    createdLabel: dateTime(item.createdAt), number: shortId(item.id), cover: item.urls?.[0] || '' }
}
function orderView(item) {
  const hints = { PENDING: item.isSeller ? '有同学想预约，请先确认物品状态。' : '等待卖家确认，确认前可直接取消。',
    ACCEPTED: item.isBuyer ? '已为你预留商品，约好时间后当面交付。' : '已有同学预约，直接约定当面交付即可。',
    CANCEL_PENDING: item.cancelRequestedBy === (item.isSeller ? item.sellerId : item.buyerId) ? '等待另一方处理取消申请。' : '请阅读取消原因，选择同意或申请管理员处理。',
    DISPUTED: '管理员正在核实，处理结果会显示在这里。', COMPLETED: '本次交易已完成。', CANCELLED: '本次交易已取消。' }
  return { ...item, statusLabel: statuses[item.status] || '', number: shortId(item.id), createdLabel: dateTime(item.createdAt),
    hint: hints[item.status] || '', archivedLabel: dateTime(item.archivedAt), expiresLabel: dateTime(item.archiveExpiresAt),
    active: ['PENDING', 'ACCEPTED', 'CANCEL_PENDING', 'DISPUTED'].includes(item.status),
    canArchive: ['COMPLETED', 'CANCELLED'].includes(item.status) && !item.archived,
    canRespond: item.status === 'CANCEL_PENDING' && item.cancelRequestedBy !== (item.isSeller ? item.sellerId : item.buyerId) }
}
module.exports = { categories, conditions, statuses, productView, orderView }
