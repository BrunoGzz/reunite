// One-time setup: creates .env if missing, fills an empty SESSION_SECRET, and locks the file down.
// Never prints values and never overwrites a value that is already set.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env')

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(path.join(root, '.env.example'), envPath)
  console.log('Created .env from .env.example')
}

let text = fs.readFileSync(envPath, 'utf8')
if (/^SESSION_SECRET=\s*$/m.test(text)) {
  text = text.replace(/^SESSION_SECRET=\s*$/m, `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`)
  console.log('Generated SESSION_SECRET')
} else if (!/^SESSION_SECRET=/m.test(text)) {
  text += `\nSESSION_SECRET=${crypto.randomBytes(32).toString('hex')}\n`
  console.log('Added SESSION_SECRET')
}
fs.writeFileSync(envPath, text)
fs.chmodSync(envPath, 0o600)

const empty = text.split('\n').filter((l) => /^(DEEPSEEK_API_KEY|OPENAI_API_KEY)=\s*$/.test(l)).map((l) => l.split('=')[0])
console.log('.env is private (mode 600).')
if (empty.length) console.log(`Still empty (voice input will be off): ${empty.join(', ')}`)
