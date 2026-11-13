const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createMediaGateway } = require('../../cloudfunctions/campus-api/lib/media')

function fixture(overrides = {}) {
  return {
    uploadFile: async () => ({ fileID: 'cloud://test/private/image.png' }),
    getTempFileURL: async () => ({ fileList: [{ status: 0, tempFileURL: 'https://example.invalid/signed-image' }] }),
    openapi: { security: { mediaCheckAsync: async () => ({ errCode: 0, traceId: 'trace-123' }) } },
    ...overrides
  }
}

test('media gateway returns a pending trace only after storage and platform acceptance', async () => {
  const cloud = fixture()
  let submitted
  cloud.openapi.security.mediaCheckAsync = async args => { submitted = args; return { errCode: 0, traceId: 'trace-123' } }
  const result = await createMediaGateway(cloud).upload('asset', { ext: 'png', base64: 'aW1hZ2U=' }, 'caller')
  assert.equal(result.traceId, 'trace-123')
  assert.equal(submitted.openid, 'caller')
  assert.equal(submitted.version, 2)
  assert.equal(submitted.mediaType, 2)
})

test('unreadable storage objects never reach the safety API', async () => {
  const cloud = fixture({ getTempFileURL: async () => ({ fileList: [{ status: -1, tempFileURL: '' }] }) })
  cloud.openapi.security.mediaCheckAsync = async () => assert.fail('must not request review')
  await assert.rejects(() => createMediaGateway(cloud).upload('asset', { ext: 'png', base64: 'aW1hZ2U=' }, 'caller'),
    error => error.code === 'MEDIA_UPLOAD_FAILED' && error.message === '无法读取待审核图片')
})

test('safety failures retain a safe numeric code but never expose provider payloads', async () => {
  const cloud = fixture()
  cloud.openapi.security.mediaCheckAsync = async () => { throw { errCode: -604100, errMsg: 'private-url-and-identity' } }
  await assert.rejects(() => createMediaGateway(cloud).upload('asset', { ext: 'png', base64: 'aW1hZ2U=' }, 'caller'), error => {
    assert.equal(error.code, 'MEDIA_UPLOAD_FAILED')
    assert.match(error.message, /-604100/)
    assert.doesNotMatch(error.message, /private-url|identity/)
    return true
  })
})
