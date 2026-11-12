const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
function createMiniProgram({ envVersion = 'develop', environments = { develop: 'test-cloud-env', trial: 'test-cloud-env', release: '' }, wxOverrides = {}, storage = new Map() } = {}) {
  const root = path.resolve(__dirname, '../../miniprogram')
  const cache = new Map(), navigation = []
  let app, lastPage
  const wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getStorageSync: key => storage.has(key) ? structuredClone(storage.get(key)) : '',
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: key => storage.delete(key),
    navigateTo: ({ url }) => navigation.push(url),
    showToast: () => {},
    cloud: { init() {}, callFunction: async () => { throw new Error('Cloud transport must be injected by this test') } },
    ...wxOverrides
  }
  const context = vm.createContext({
    wx, getApp: () => app, console, setTimeout, clearTimeout,
    App(definition) { app = definition },
    Page(definition) {
      lastPage = { ...definition, data: structuredClone(definition.data),
        setData(values, callback) {
          for (const [key, value] of Object.entries(values)) {
            const parts = key.split('.')
            let target = this.data
            for (const part of parts.slice(0, -1)) target = target[part] ||= {}
            target[parts.at(-1)] = value
          }
          if (callback) callback()
        }
      }
    }
  })
  function load(relative, parent = path.join(root, 'app.js')) {
    let file = path.resolve(path.dirname(parent), relative)
    if (!path.extname(file)) file += '.js'
    if (!file.startsWith(root + path.sep)) throw new Error('Test module must be inside miniprogram')
    if (file === path.join(root, 'utils/environments.local.js')) return environments
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const run = new vm.Script('(function(require,module,exports){\n' + fs.readFileSync(file, 'utf8') + '\n})', { filename: file }).runInContext(context)
    run(child => load(child, file), module, module.exports)
    return module.exports
  }
  load('./app.js')
  return { app, wx, storage, navigation, load,
    config: load('./utils/config.js'), auth: load('./services/auth.js'),
    tasks: load('./services/tasks.js'), forum: load('./services/forum.js'), reports: load('./services/reports.js'),
    page(relative) { load(relative); return lastPage }
  }
}
module.exports = { createMiniProgram }
