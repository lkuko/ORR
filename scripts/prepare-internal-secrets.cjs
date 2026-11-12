// Only run after the release directory ACL has been restricted by deploy-internal.ps1.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const dotenv = require('../server/node_modules/dotenv')

try {
  const version = process.argv[2]
  if (!/^[a-z0-9][a-z0-9_.-]{0,80}$/.test(version || '')) throw new Error('Invalid release version')
  const repo = path.resolve(__dirname, '..')
  const release = path.join(repo, '.local', 'releases', version)
  if (fs.realpathSync(release).toLowerCase() !== release.toLowerCase()) throw new Error('Release directory cannot be redirected')
  const config = dotenv.parse(fs.readFileSync(path.join(repo, 'server/.env')))
  for (const name of ['WECHAT_APP_ID', 'WECHAT_APP_SECRET']) {
    if (!config[name] || /[\r\n]/.test(config[name]) || /replace|example/i.test(config[name])) {
      throw new Error(`Configure ${name} in server/.env before deployment`)
    }
  }
  const bootstrap = path.join(release, 'package', 'bootstrap')
  fs.mkdirSync(bootstrap, { mode: 0o700 }) // Never replace previously generated credentials.
  const random = () => crypto.randomBytes(32).toString('hex')
  const serverConfig = {
    TOKEN_SECRET: random(), ADMIN_USERNAME: 'admin'
  }
  fs.writeFileSync(path.join(bootstrap, 'server.env'), Object.entries(serverConfig).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 })
  const wechatConfig = { WECHAT_APP_ID: config.WECHAT_APP_ID, WECHAT_APP_SECRET: config.WECHAT_APP_SECRET }
  fs.writeFileSync(path.join(bootstrap, 'wechat.env'), Object.entries(wechatConfig).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 })
  for (const name of ['db-password', 'mysql-root-password', 'initial-admin-password']) {
    fs.writeFileSync(path.join(bootstrap, name), random() + '\n', { mode: 0o600 })
  }
  const archive = path.join(release, 'upload.tar.gz')
  const tar = spawnSync('tar', ['-czf', archive, '-C', path.join(release, 'package'), 'app', 'bootstrap'], { encoding: 'utf8' })
  if (tar.status !== 0) throw new Error(`Private archive creation failed: ${tar.error?.message || tar.stderr || tar.status}`)
  const result = {
    version, release, archive,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
    adminPasswordFile: path.join(bootstrap, 'initial-admin-password'),
    log: path.join(release, 'deploy.log')
  }
  fs.writeFileSync(path.join(release, 'private-release.json'), JSON.stringify(result, null, 2) + '\n')
  fs.writeFileSync(path.join(repo, '.local/latest-internal-release.json'), JSON.stringify(result, null, 2) + '\n')
  process.stdout.write(JSON.stringify(result) + '\n')
} catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1 }
