// Loads ../.env no matter which folder the server is started from. Import this first.
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')
dotenv.config({ path: envPath, quiet: true })

if (fs.existsSync(envPath) && (fs.statSync(envPath).mode & 0o077) !== 0) {
  console.warn('Warning: .env can be read by other users. Run: npm run setup --prefix server')
}
