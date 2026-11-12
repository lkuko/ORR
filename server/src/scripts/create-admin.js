const { getPool, closePool } = require('../db/pool')
const { env } = require('../config/env')
const { hashPassword } = require('../lib/passwords')

async function main() {
  const username = process.argv[2] || env.adminUsername
  const password = process.argv[3] || env.adminPassword
  if (!username || !password || password.length < 12) {
    throw new Error('Usage: npm run create-admin -- <username> <password-at-least-12-chars>')
  }
  const passwordHash = await hashPassword(password)
  await getPool().execute(
    `INSERT INTO admin_users (username, password_hash) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), status = 'ACTIVE'`,
    [username, passwordHash]
  )
  process.stdout.write(`Admin ${username} is ready\n`)
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
}).finally(closePool)
