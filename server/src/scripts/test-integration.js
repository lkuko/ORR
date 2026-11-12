const { spawnSync } = require('node:child_process')
const path = require('node:path')
require('../config/env')
const env = { ...process.env, NODE_ENV: 'test', DB_NAME: process.env.TEST_DB_NAME || 'campus_runner_test', WECHAT_LOGIN_MODE: 'demo', CONTENT_CHECK_MODE: 'disabled' }
if (!env.DB_NAME.endsWith('_test')) throw new Error('Integration tests require a database name ending with _test')
for (const args of [['src/db/migrate.js'], ['--test', 'tests/integration/api.test.js']]) {
  const result = spawnSync(process.execPath, args, { env, cwd: path.resolve(__dirname, '../..'), stdio: 'inherit' })
  if (result.status !== 0) { process.exitCode = result.status || 1; break }
}
