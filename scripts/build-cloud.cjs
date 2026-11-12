const fs = require('node:fs')
const path = require('node:path')
const esbuild = require('esbuild')
const root = path.resolve(__dirname, '..')
const source = path.join(root, 'cloudfunctions/campus-api')
const output = path.join(root, '.local/deploy/campus-api')
const privatePath = path.join(root, 'project.private.config.json')
const local = fs.existsSync(privatePath) ? JSON.parse(fs.readFileSync(privatePath, 'utf8')) : {}
const appId = process.env.WECHAT_APP_ID || local.appid
if (typeof appId !== 'string' || !/^wx[0-9a-f]{16}$/.test(appId)) {
  throw new Error('请在 project.private.config.json 或 WECHAT_APP_ID 环境变量中配置有效 AppID，不能使用示例占位符。')
}
fs.mkdirSync(output, { recursive: true })
esbuild.buildSync({
  entryPoints: [path.join(source, 'index.js')], outfile: path.join(output, 'index.js'),
  bundle: true, platform: 'node', target: 'node16.13', format: 'cjs',
  packages: 'external', sourcemap: false, minify: false,
  define: { 'process.env.WECHAT_APP_ID': JSON.stringify(appId) }
})
for (const name of ['package.json', 'package-lock.json', 'config.json']) {
  fs.copyFileSync(path.join(source, name), path.join(output, name))
}
const dependencies = JSON.parse(fs.readFileSync(path.join(output, 'package.json'))).dependencies
if (Object.values(dependencies).some(value => /^(file:|link:)/.test(value))) throw new Error('Cloud package has a local dependency')
console.log('Self-contained cloud artifact:', output)
