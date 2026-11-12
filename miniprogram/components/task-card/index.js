Component({ properties: { task: Object }, methods: { open() { this.triggerEvent('open', { id: this.properties.task.id }) } } })
