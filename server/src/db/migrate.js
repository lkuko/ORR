const fs = require('node:fs/promises')
const path = require('node:path')
const { getPool, closePool } = require('./pool')

async function migrate() {
  const pool = getPool()
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(190) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)

  const folder = path.join(__dirname, 'migrations')
  const names = (await fs.readdir(folder)).filter(name => name.endsWith('.sql')).sort()
  for (const name of names) {
    const [rows] = await pool.execute('SELECT name FROM schema_migrations WHERE name = ?', [name])
    if (rows.length) continue
    const sql = await fs.readFile(path.join(folder, name), 'utf8')
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      for (const statement of sql.split(';').map(part => part.trim()).filter(Boolean)) {
        await connection.query(statement)
      }
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [name])
      await connection.commit()
      process.stdout.write(`Applied ${name}\n`)
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }
}

migrate().catch(error => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
}).finally(closePool)
