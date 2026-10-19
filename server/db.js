import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const dataDir = path.join(here, 'data')
// Contact request photos. REUNITE_PHOTOS lets tests and local trials use their own folder instead of the real one.
export const photoDir = process.env.REUNITE_PHOTOS || path.join(dataDir, 'photos')
fs.mkdirSync(photoDir, { recursive: true })

const db = new Database(process.env.REUNITE_DB || path.join(dataDir, 'reunite.db'))
db.pragma('journal_mode = WAL')
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'))

export default db

export function now() {
  return new Date().toISOString()
}
