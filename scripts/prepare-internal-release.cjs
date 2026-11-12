// Called by prepare-internal-release.ps1 after the local admin build.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const repo = path.resolve(__dirname, '..')
const entries = [
  'server/src', 'server/package.json', 'server/package-lock.json', 'server/.dockerignore',
  'admin/dist', 'admin/default.conf.template', 'admin/.dockerignore',
  'deploy/api.Dockerfile', 'deploy/admin.internal.Dockerfile',
  'deploy/admin.internal.Dockerfile.dockerignore', 'deploy/internal.compose.yaml',
  'deploy/install-internal.sh', 'deploy/resume-arl.sh', 'deploy/verify-internal.sh',
  'deploy/rotate-wechat.sh', 'deploy/rollback-wechat.sh'
]

function copyEntry(relative, destination, files) {
  const source = path.join(repo, relative)
  const info = fs.lstatSync(source)
  if (info.isSymbolicLink()) throw new Error(`Release inputs cannot contain links: ${relative}`)
  if (info.isDirectory()) {
    for (const name of fs.readdirSync(source).sort()) copyEntry(path.join(relative, name), destination, files)
    return
  }
  if (!info.isFile() || /(^|[\\/])(?:\.env(?:\..*)?|node_modules|\.local|\.git)(?:[\\/]|$)/.test(relative)) {
    throw new Error(`Unexpected release input: ${relative}`)
  }
  const target = path.join(destination, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const contents = fs.readFileSync(source)
  fs.writeFileSync(target, contents)
  files.push({ path: relative.split(path.sep).join('/'), sha256: crypto.createHash('sha256').update(contents).digest('hex'), size: contents.length })
}

function prepare() {
  const version = process.argv[2] || `internal-${new Date().toISOString().replace(/[-:.]/g, '').replace('Z', '').toLowerCase()}-${crypto.randomBytes(3).toString('hex')}`
  if (!/^[a-z0-9][a-z0-9_.-]{0,80}$/.test(version)) throw new Error('Invalid release version')
  for (const entry of entries) if (!fs.existsSync(path.join(repo, entry))) throw new Error(`Missing release input: ${entry}`)
  const release = path.join(repo, '.local', 'releases', version)
  fs.mkdirSync(path.dirname(release), { recursive: true })
  fs.mkdirSync(release) // Never overwrite an earlier package.
  const staging = path.join(release, 'package')
  const app = path.join(staging, 'app')
  fs.mkdirSync(app, { recursive: true })
  const files = []
  for (const entry of entries) copyEntry(entry, app, files)
  fs.writeFileSync(path.join(app, 'release-manifest.json'), JSON.stringify({ version, frontend: 'prebuilt-same-origin', files }, null, 2) + '\n')
  const archive = path.join(release, 'source.tar.gz')
  const tar = spawnSync('tar', ['-czf', archive, '-C', staging, 'app'], { encoding: 'utf8' })
  if (tar.status !== 0) throw new Error(`Archive creation failed: ${tar.error?.message || tar.stderr || tar.status}`)
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
  fs.writeFileSync(path.join(release, 'source.sha256'), `${sha256}  source.tar.gz\n`)
  const result = { version, release, staging, archive, sha256, fileCount: files.length, bytes: fs.statSync(archive).size }
  fs.writeFileSync(path.join(release, 'release.json'), JSON.stringify(result, null, 2) + '\n')
  process.stdout.write(JSON.stringify(result) + '\n')
}

try { prepare() } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1 }
