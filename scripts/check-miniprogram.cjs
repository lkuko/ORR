const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
let scriptCount = 0, jsonCount = 0
function inspect(folder) {
  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const file = path.join(folder, entry.name)
    if (entry.isDirectory()) inspect(file)
    else if (file.endsWith('.js')) {
      const source = read(file)
      new vm.Script(source, { filename: file })
      scriptCount++
      for (const [, dependency] of source.matchAll(/require\(['"](\.[^'"]*)['"]\)/g)) {
        const target = path.resolve(root, path.dirname(file), dependency)
        assert.ok(fs.existsSync(target) || fs.existsSync(target + '.js'), `${file}: missing ${dependency}`)
      }
    } else if (file.endsWith('.json')) {
      JSON.parse(read(file))
      jsonCount++
    }
  }
}

try {
  for (const folder of ['pages', 'components', 'services', 'utils']) inspect(folder)
  new vm.Script(read('app.js'), { filename: 'app.js' })
  scriptCount++
  const app = JSON.parse(read('app.json'))
  const project = JSON.parse(read('project.config.json'))
  JSON.parse(read('sitemap.json'))
  jsonCount += 3
  assert.equal(new Set(app.pages).size, app.pages.length, 'Page registration contains duplicates')
  for (const page of app.pages) {
    for (const extension of ['.js', '.json', '.wxml', '.wxss']) {
      assert.ok(fs.existsSync(path.join(root, page + extension)), `Page file missing: ${page + extension}`)
    }
  }
  for (const item of app.tabBar.list) assert.ok(app.pages.includes(item.pagePath), `Unregistered tab: ${item.pagePath}`)
  const ignored = new Set(project.packOptions.ignore.filter(item => item.type === 'folder').map(item => item.value))
  for (const folder of ['server', 'admin', 'deploy', 'docs', 'scripts', '.local', '.git', '.agents']) {
    assert.ok(ignored.has(folder), `Must exclude ${folder} from the mini-program package`)
  }
  if (process.argv.includes('--release')) {
    for (const envVersion of ['trial', 'release']) {
      const module = { exports: {} }
      vm.runInNewContext(read('utils/config.js'), { module, wx: { getAccountInfoSync: () => ({ miniProgram: { envVersion } }) } })
      const config = module.exports
      assert.equal(config.useDemoData, false)
      assert.equal(config.useDemoLogin, false)
      const endpoint = new URL(config.apiBaseUrl)
      assert.equal(endpoint.protocol, 'https:', `${envVersion}: HTTPS is required`)
      assert.ok(!/(^|\.)example\.com$|localhost|^127\./i.test(endpoint.hostname), `${envVersion}: configure the actual HTTPS API domain before release`)
    }
  }
  console.log(`Mini-program checks passed: ${scriptCount} scripts, ${jsonCount} JSON files, ${app.pages.length} complete pages, package exclusions verified.`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
