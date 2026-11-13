const market = require('../services/market')
const { confirm } = require('./dialog')
async function archiveOrder(id) {
  const days = await new Promise((resolve, reject) => wx.showActionSheet({
    alertText: '删除记录后，可在回收站恢复',
    itemList: ['保留 7 天（默认）', '保留 30 天'],
    success: result => resolve([7, 30][result.tapIndex]),
    fail: error => /cancel/i.test(error.errMsg || '') ? resolve(0) : reject(new Error('暂时无法选择保留期，请重试'))
  }))
  if (!days) return null
  const result = await confirm('移入回收站', '仅删除你列表中的这条记录，' + days + ' 天内可恢复。到期后无法恢复，另一方的记录不受影响。')
  return result.confirm ? market.orderAction(id, 'archive', { days }) : null
}
module.exports = { archiveOrder }
