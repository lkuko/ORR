Component({
  properties: { product: Object, busy: Boolean },
  methods: {
    open() { if (!this.data.product.unavailable) this.triggerEvent('open', { id: this.data.product.id }) },
    favorite() { if (!this.data.busy) this.triggerEvent('favorite', { id: this.data.product.id, active: !this.data.product.favorited }) }
  }
})
