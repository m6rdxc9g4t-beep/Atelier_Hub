import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db/database.js'

const config = loadConfig()
const db = openDatabase(config.dataDir)
const app = await buildApp({ config, db, logger: true })

const close = async () => {
  await app.close()
  db.close()
  process.exit(0)
}
process.on('SIGINT', close)
process.on('SIGTERM', close)

await app.listen({ host: config.host, port: config.port })
