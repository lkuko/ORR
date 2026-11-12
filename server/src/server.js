const { createApp } = require('./app')
const { env, assertProductionConfig } = require('./config/env')
const { closePool } = require('./db/pool')

assertProductionConfig()
const server = createApp().listen(env.port, env.host, () => {
  process.stdout.write(`API listening on ${env.port}\n`)
})

async function shutdown() {
  server.close(async () => {
    await closePool()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
