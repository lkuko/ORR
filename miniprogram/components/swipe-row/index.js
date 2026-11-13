Component({
  properties: {
    recordId: String,
    open: Boolean,
    disabled: Boolean,
    enabled: { type: Boolean, value: true }
  },
  data: { offset: 0, dragging: false },
  observers: {
    'open, enabled': function(open, enabled) {
      this.setData({ offset: open && enabled ? -(this.actionWidth || 80) : 0, dragging: false })
    }
  },
  lifetimes: {
    attached() {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.actionWidth = info.windowWidth * 160 / 750
      this.setData({ offset: this.properties.open && this.properties.enabled ? -this.actionWidth : 0 })
    }
  },
  methods: {
    start(event) {
      if (this.properties.disabled || !this.properties.enabled || event.touches.length !== 1) return
      const touch = event.touches[0]
      this.gesture = { x: touch.clientX, y: touch.clientY, offset: this.data.offset, axis: '', dx: 0 }
    },
    move(event) {
      const gesture = this.gesture
      if (!gesture || this.properties.disabled || event.touches.length !== 1) return
      const touch = event.touches[0], dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y
      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y'
      if (gesture.axis !== 'x') return
      gesture.dx = dx
      this.setData({ dragging: true, offset: Math.max(-this.actionWidth, Math.min(0, gesture.offset + dx)) })
    },
    end() {
      const gesture = this.gesture
      this.gesture = null
      if (!gesture || gesture.axis !== 'x') return
      this.triggerEvent('swiping', { id: this.properties.recordId })
      const open = this.data.offset < -this.actionWidth * .4
      this.setData({ dragging: false, offset: open ? -this.actionWidth : 0 })
      this.triggerEvent(open ? 'reveal' : 'close', { id: this.properties.recordId })
    },
    cancel() {
      this.gesture = null
      this.setData({ dragging: false, offset: this.properties.open ? -this.actionWidth : 0 })
    },
    clear() {
      if (!this.properties.disabled) this.triggerEvent('clear', { id: this.properties.recordId })
    }
  }
})
