// Run only after rotate-cloud-wechat.ps1 has restricted the rotation directory ACL.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { parseEnv } = require('node:util')
const { spawnSync } = require('node:child_process')

try {
  const id = process.argv[2]
  if (!/^wechat-[0-9]{14}-[a-f0-9]{6}$/.test(id || '')) throw new Error('Invalid rotation ID')
  const repo = path.resolve(__dirname, '..')
  const rotation = path.join(repo, '.local', 'rotations', id)
  if (fs.realpathSync(rotation).toLowerCase() !== rotation.toLowerCase()) throw new Error('Rotation directory cannot be redirected')
  const config = parseEnv(fs.readFileSync(path.join(repo, 'server', '.env'), 'utf8'))
  const project = JSON.parse(fs.readFileSync(path.join(repo, 'project.config.json'), 'utf8'))
  const appId = config.WECHAT_APP_ID
  const appSecret = config.WECHAT_APP_SECRET
  if (!/^wx[a-f0-9]{16}$/.test(appId || '') || project.appid !== appId) {
    throw new Error('The server and mini-program AppIDs must match')
  }
  if (!/^[A-Za-z0-9]{16,128}$/.test(appSecret || '')) {
    throw new Error('Configure a valid WECHAT_APP_SECRET in server/.env')
  }

  const staging = path.join(rotation, 'package')
  fs.mkdirSync(path.join(staging, 'deploy'), { recursive: true, mode: 0o700 })
  for (const name of ['internal.compose.yaml', 'rotate-wechat.sh', 'rollback-wechat.sh']) {
    const source = path.join(repo, 'deploy', name)
    if (!fs.lstatSync(source).isFile()) throw new Error(`Invalid rotation input: ${name}`)
    fs.writeFileSync(path.join(staging, 'deploy', name), fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n'), { flag: 'wx', mode: 0o600 })
  }
  const credentials = `WECHAT_APP_ID=${JSON.stringify(appId)}\nWECHAT_APP_SECRET=${JSON.stringify(appSecret)}\n`
  fs.writeFileSync(path.join(staging, 'wechat.env'), credentials, { flag: 'wx', mode: 0o600 })
  const archive = path.join(rotation, 'wechat-rotation.tar.gz')
  const tar = spawnSync('tar', ['-czf', archive, '-C', staging, 'deploy', 'wechat.env'], { encoding: 'utf8' })
  if (tar.status !== 0) throw new Error('Private rotation archive creation failed')
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
  const result = { id, appId, archive, sha256, log: path.join(rotation, 'rotation.log') }
  fs.writeFileSync(path.join(rotation, 'rotation.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  process.stdout.write(JSON.stringify(result) + '\n')
} catch (error) {
  process.stderr.write(`WeChat rotation preparation failed: ${error.message}\n`)
  process.exitCode = 1
}
