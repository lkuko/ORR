Component({ properties: { title: String, description: String, buttonText: String }, methods: { action() { this.triggerEvent('action') } } })
