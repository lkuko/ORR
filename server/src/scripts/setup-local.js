// Only provisions this project's isolated loopback MySQL instance on port 13306.
const mysql = require('mysql2/promise')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

async function main() {
  const root = path.resolve(__dirname, '../..')
  const configFile = path.join(root, '../.local/database.json')
  let credentials
  try { credentials = JSON.parse(await fs.readFile(configFile, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: 13306, user: 'root', password: credentials?.password || '' })
  try {
    if (!credentials) {
      credentials = { password: crypto.randomBytes(32).toString('hex') }
      await fs.writeFile(configFile, JSON.stringify(credentials), { flag: 'wx' })
      await connection.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [credentials.password])
    }
    await connection.query('CREATE DATABASE IF NOT EXISTS campus_runner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
    await connection.query('CREATE DATABASE IF NOT EXISTS campus_runner_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
    const appPassword = crypto.randomBytes(32).toString('hex')
    // Existing .env means the app credentials were already provisioned.
    try { await fs.access(path.join(root, '.env')); console.log('Local database ready on 127.0.0.1:13306'); return } catch (_) {}
    await connection.query("CREATE USER IF NOT EXISTS 'campus_runner'@'127.0.0.1' IDENTIFIED BY ?", [appPassword])
    await connection.query("ALTER USER 'campus_runner'@'127.0.0.1' IDENTIFIED BY ?", [appPassword])
    await connection.query("GRANT ALL PRIVILEGES ON campus_runner.* TO 'campus_runner'@'127.0.0.1'")
    await connection.query("GRANT ALL PRIVILEGES ON campus_runner_test.* TO 'campus_runner'@'127.0.0.1'")
    const content = ['NODE_ENV=development', 'PORT=3000', 'WEB_ORIGIN=http://localhost:5173', 'WECHAT_LOGIN_MODE=demo', 'CONTENT_CHECK_MODE=disabled', `TOKEN_SECRET=${crypto.randomBytes(32).toString('hex')}`, 'DB_HOST=127.0.0.1', 'DB_PORT=13306', 'DB_NAME=campus_runner', 'DB_USER=campus_runner', `DB_PASSWORD=${appPassword}`, 'ADMIN_USERNAME=admin', `ADMIN_PASSWORD=${crypto.randomBytes(18).toString('hex')}`, ''].join('\n')
    await fs.writeFile(path.join(root, '.env'), content, { flag: 'wx' })
    console.log('Local database ready on 127.0.0.1:13306. Credentials saved only in ignored server/.env.')
  } finally { await connection.end() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
