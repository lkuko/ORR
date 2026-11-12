const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// Execute the actual mini-program modules with a small wx adapter. Only wx's
// transport/storage boundary is substituted; the HTTP server and SQL stay real.
function createMiniProgram({ apiBaseUrl, account = 'one', envVersion = 'develop', testAccount = false, wxOverrides = {} } = {}) {
  const root = path.resolve(__dirname, '../../..')
  const cache = new Map()
  const storage = new Map([['developmentAccount', account]])
  const navigation = []
  let app, lastPage
  const wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion } }),
    getStorageSync: key => storage.has(key) ? structuredClone(storage.get(key)) : '',
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    navigateTo: ({ url }) => navigation.push(url),
    showToast: () => {},
    request(options) {
      const method = options.method || 'GET'
      fetch(options.url, {
        method, headers: options.header,
        ...(method === 'GET' ? {} : { body: JSON.stringify(options.data) })
      }).then(async response => {
        options.success({ statusCode: response.status, data: await response.json() })
      }).catch(error => options.fail(error))
    },
    ...wxOverrides
  }
  const context = vm.createContext({
    wx, getApp: () => app, console, setTimeout, clearTimeout,
    App(definition) { app = definition },
    Page(definition) {
      lastPage = {
        ...definition,
        data: structuredClone(definition.data),
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
    if (!file.startsWith(root + path.sep)) throw new Error('Test module must be inside this project')
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const run = new vm.Script(`(function(require,module,exports){\n${fs.readFileSync(file, 'utf8')}\n})`, { filename: file }).runInContext(context)
    run(child => load(child, file), module, module.exports)
    if (file === path.join(root, 'utils/config.js')) {
      if (apiBaseUrl) module.exports.apiBaseUrl = apiBaseUrl
      if (testAccount && envVersion === 'develop') {
        module.exports.useDemoLogin = true
        module.exports.useDemoData = false
      }
    }
    return module.exports
  }
  load('./app.js')
  return {
    app, wx, navigation,
    config: load('./utils/config.js'),
    auth: load('./services/auth.js'),
    tasks: load('./services/tasks.js'),
    forum: load('./services/forum.js'),
    reports: load('./services/reports.js'),
    page(relative) { load(relative); return lastPage }
  }
}

module.exports = { createMiniProgram }
