const mysql = require('mysql2/promise')
const { env } = require('../config/env')

let pool

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.database.host,
      port: env.database.port,
      database: env.database.name,
      user: env.database.user,
      password: env.database.password,
      connectionLimit: env.database.connectionLimit,
      charset: 'utf8mb4',
      timezone: 'Z',
      decimalNumbers: true,
      namedPlaceholders: true
    })
    pool.on('connection', connection => {
      connection.query("SET time_zone = '+00:00'")
    })
  }
  return pool
}

async function closePool() {
  if (pool) {
    const current = pool
    pool = undefined
    await current.end()
  }
}

module.exports = { getPool, closePool }
