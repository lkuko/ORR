const v = require('./validation')
const { check, AppError } = require('./errors')
function decodeImage(data) {
  check(typeof data.base64 === 'string' && data.base64.length > 0 && data.base64.length <= 956000 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(data.base64), 'INVALID_IMAGE', '图片数据无效')
  const buffer = Buffer.from(data.base64, 'base64')
  check(buffer.toString('base64') === data.base64, 'INVALID_IMAGE', '图片编码不正确')
  check(buffer.length >= 16 && buffer.length <= 700 * 1024, 'INVALID_IMAGE', '压缩后的图片需小于 700KB')
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
  check(png || jpg, 'INVALID_IMAGE', '仅支持 JPG 或 PNG 图片')
  return { base64: data.base64, ext: png ? 'png' : 'jpg', contentHash: v.hash(data.base64) }
}
async function status(store, asset, now) {
  if (!asset.traceId) return 'UPLOADING'
  const result = await store.get('media_checks', v.hash('media-check', asset.traceId))
  if (result) return result.status
  return Date.parse(now) - Date.parse(asset.submittedAt) > 35 * 60 * 1000 ? 'ERROR' : 'PENDING'
}
async function approvedAsset(store, id) {
  const asset = await store.get('media_assets', id)
  check(asset && await status(store, asset, new Date().toISOString()) === 'PASSED', 'IMAGE_NOT_APPROVED', '图片尚未通过检查，请刷新审核状态后再发布')
  return asset
}
function createMediaGateway(cloud) {
  return {
    async upload(id, data, openid) {
      try {
        const { fileID } = await cloud.uploadFile({ cloudPath: 'market/private/' + id + '.' + data.ext, fileContent: Buffer.from(data.base64, 'base64') })
        return { fileId: fileID, ...await this.check(fileID, openid) }
      } catch (error) {
        if (error instanceof AppError) throw error
        throw mediaFailure('upload', error, '图片上传未完成，请重试')
      }
    },
    async check(fileId, openid) {
      try {
        const response = await cloud.getTempFileURL({ fileList: [{ fileID: fileId, maxAge: 3600 }] })
        const url = response.fileList?.[0]?.tempFileURL
        check(url && response.fileList[0].status === 0, 'MEDIA_UPLOAD_FAILED', '无法读取待审核图片')
        const result = await cloud.openapi.security.mediaCheckAsync({ mediaUrl: url, mediaType: 2, version: 2, scene: 3, openid })
        const traceId = result.traceId || result.trace_id
        check((result.errCode === 0 || result.errcode === 0) && typeof traceId === 'string' && traceId.length < 160,
          'MEDIA_UPLOAD_FAILED', '未能提交图片审核')
        return { traceId }
      } catch (error) {
        if (error instanceof AppError) throw error
        throw mediaFailure('check', error, '图片安全检查未完成，请重试')
      }
    },
    async urls(fileIds) {
      if (!fileIds.length) return []
      const output = []
      for (let start = 0; start < fileIds.length; start += 50) {
        const response = await cloud.getTempFileURL({ fileList: fileIds.slice(start, start + 50).map(fileID => ({ fileID, maxAge: 600 })) })
        output.push(...response.fileList.map(file => file.status === 0 ? file.tempFileURL : ''))
      }
      return output
    }
  }
}
function mediaFailure(stage, error, message) {
  // Keep provider diagnostics useful without logging image bytes, URLs or identities.
  const rawCode = error?.errCode ?? error?.errcode ?? error?.code
  const code = /^-?\d{1,9}$/.test(String(rawCode)) ? Number(rawCode) : null
  console.warn('[media-service]', { stage, code })
  return new AppError('MEDIA_UPLOAD_FAILED', message + (code === null ? '' : '（错误码 ' + code + '）'))
}
module.exports = { decodeImage, status, approvedAsset, createMediaGateway }
