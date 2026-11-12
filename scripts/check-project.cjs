const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
let scripts = 0, jsonFiles = 0
function inspect(folder) {
  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const file = path.join(folder, entry.name)
    if (entry.isDirectory()) inspect(file)
    else if (file.endsWith('.js')) {
      const source = read(file)
      new vm.Script(source, { filename: file }); scripts++
      for (const [, dependency] of source.matchAll(/require\(['"](\.[^'"]*)['"]\)/g)) {
        const target = path.resolve(root, path.dirname(file), dependency)
        assert.ok(fs.existsSync(target) || fs.existsSync(target + '.js'), file + ': missing ' + dependency)
      }
      if (folder.startsWith('miniprogram')) assert.ok(!/wx\.request\(|wx\.login\(|apiBaseUrl|demo-store/.test(source), file + ': legacy transport')
    } else if (file.endsWith('.json')) { JSON.parse(read(file)); jsonFiles++ }
  }
}
for (const dir of ['miniprogram', 'cloudfunctions/campus-api']) inspect(dir)
const project = JSON.parse(read('project.config.json'))
const app = JSON.parse(read('miniprogram/app.json'))
assert.equal(project.miniprogramRoot, 'miniprogram/')
assert.equal(project.cloudfunctionRoot, 'cloudfunctions/')
assert.equal(project.setting.urlCheck, true)
assert.equal(app.debug, false)
assert.ok(app.pages.includes('pages/report/list/index'), 'Missing report history page')
assert.equal(new Set(app.pages).size, app.pages.length)
for (const page of app.pages) for (const suffix of ['.js', '.json', '.wxml', '.wxss']) {
  assert.ok(fs.existsSync(path.join(root, 'miniprogram', page + suffix)), 'Missing page ' + page + suffix)
}
for (const item of app.tabBar.list) for (const key of ['iconPath', 'selectedIconPath']) {
  assert.ok(fs.existsSync(path.join(root, 'miniprogram', item[key])), 'Missing icon')
}
for (const envVersion of ['develop', 'trial', 'release', 'unknown']) {
  const module = { exports: {} }
  vm.runInNewContext(read('miniprogram/utils/config.js'), { module, wx: { getAccountInfoSync: () => ({ miniProgram: { envVersion } }) } })
  assert.equal('useDemoData' in module.exports, false)
  assert.equal('useDemoLogin' in module.exports, false)
  if (process.argv.includes('--release') && envVersion === 'release') assert.ok(module.exports.cloudEnv, 'Production environment is not configured')
}
const schema = JSON.parse(read('database/collections.json'))
assert.equal(schema.collections.length, 10)
for (const collection of schema.collections) assert.deepEqual(collection.rules, { read: false, write: false })
console.log('Project checks passed:', scripts, 'scripts,', jsonFiles, 'JSON files,', app.pages.length, 'pages; cloud transport and client database denial declared.')
