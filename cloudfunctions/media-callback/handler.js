const { createHash } = require('node:crypto')
const idFor = trace => createHash('sha256').update('media-check\0' + trace).digest('hex')
function createCallback({ store, allowedAppId, clock = () => new Date() }) {
  return async (event, source) => {
    // SOURCE comes from wx-server-sdk runtime context, never from event data.
    if (source !== 'wx_callback' || !allowedAppId || event.appid !== allowedAppId || event.Event !== 'wxa_media_check' ||
      event.MsgType !== 'event' || event.version !== 2 || typeof event.trace_id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(event.trace_id)) return { accepted: false }
    const status = event.errcode !== 0 ? 'ERROR' : event.result?.suggest === 'pass' ? 'PASSED'
      : ['risky', 'review'].includes(event.result?.suggest) ? 'REJECTED' : 'ERROR'
    const id = idFor(event.trace_id)
    await store.transact(async tx => {
      const previous = await tx.get('media_checks', id)
      // Replay is harmless; never promote a rejection through a conflicting duplicate.
      if (previous) return
      await tx.put('media_checks', id, { id, status, createdAt: clock().toISOString() })
    })
    return { accepted: true }
  }
}
module.exports = { createCallback }
