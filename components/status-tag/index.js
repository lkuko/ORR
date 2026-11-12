const { statusLabels } = require('../../utils/format')
Component({ properties: { status: { type: String, observer(value) { this.setData({ label: statusLabels[value] || value }) } } }, data: { label: '' } })
