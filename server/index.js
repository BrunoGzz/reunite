import db from './db.js'
import { createApp } from './app.js'
import { seed } from './seed.js'

// First start: fill the database with demo data.
if (db.prepare('SELECT COUNT(*) AS n FROM shelters').get().n === 0) seed()

// Listen on localhost only: nginx is the public entrance.
const port = process.env.PORT || 3100
const host = process.env.HOST || '127.0.0.1'
createApp().listen(port, host, () => console.log(`Reunite running on ${host}:${port}`))
