const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')

const root = path.resolve(__dirname, '../admin/dist')
const entryUrl = new URL(process.argv[2] || 'https://orr-d0gvuc3liba01ebf1-1530627261.tcloudbaseapp.com/orr-admin/index.html')
const sha256 = value => createHash('sha256').update(value).digest('hex')

async function main() {
  if (!['https:', 'http:'].includes(entryUrl.protocol)) throw new Error('管理台地址必须使用 HTTP 或 HTTPS')
  const entry = await fs.readFile(path.join(root, 'index.html'))
  const assets = [...entry.toString('utf8').matchAll(/(?:src|href)="\.\/(assets\/[^"?#]+)"/g)].map(match => match[1])
  if (!assets.length) throw new Error('没有找到管理台构建资源，请先运行 npm run build:admin')
  let mismatches = 0
  for (const name of ['index.html', ...new Set(assets)]) {
    if (name.includes('..') || name.includes('\\')) throw new Error('构建资源路径不合法')
    const local = name === 'index.html' ? entry : await fs.readFile(path.join(root, name))
    const url = name === 'index.html' ? entryUrl : new URL(name, entryUrl)
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) })
    if (!response.ok) {
      mismatches++
      console.error(`不一致 ${name}: HTTP ${response.status}`)
      continue
    }
    const remote = Buffer.from(await response.arrayBuffer())
    const same = sha256(local) === sha256(remote)
    if (!same) mismatches++
    console.log(`${same ? '一致' : '不一致'} ${name}`)
  }
  if (mismatches) {
    console.error(`发现 ${mismatches} 个文件未同步，请核对发布目录、目标环境及 CDN 缓存。`)
    process.exitCode = 1
  } else console.log(`管理台 ${assets.length + 1} 个构建文件与线上一致。`)
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
