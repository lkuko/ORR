const market = require('./market')
const invoke = (method, args) => new Promise((resolve, reject) => wx[method]({ ...args, success: resolve, fail: reject }))
async function compress(path) {
  const info = await invoke('getImageInfo', { src: path })
  let compressed = path
  for (const [edge, quality] of [[1600, 75], [1200, 55], [900, 35]]) {
    const ratio = Math.min(1, edge / Math.max(info.width, info.height))
    const result = await invoke('compressImage', { src: path, quality, compressedWidth: Math.max(1, Math.round(info.width * ratio)), compressedHeight: Math.max(1, Math.round(info.height * ratio)) })
    compressed = result.tempFilePath
    const size = await new Promise((resolve, reject) => wx.getFileSystemManager().getFileInfo({ filePath: compressed, success: x => resolve(x.size), fail: reject }))
    if (size <= 700 * 1024) return { path: compressed, size }
  }
  throw new Error('图片压缩后仍超过 700KB，请裁剪后重试')
}
async function upload(path) {
  const result = await compress(path)
  const base64 = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: result.path, encoding: 'base64', success: r => resolve(r.data), fail: reject }))
  const media = await market.upload(base64)
  return { ...media, path: result.path, sizeLabel: Math.ceil(result.size / 1024) + 'KB' }
}
module.exports = { upload, compress,
  choose: count => invoke('chooseMedia', { count, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] }) }
