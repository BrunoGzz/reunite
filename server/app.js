import './env.js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import session from 'express-session'
import auth from './routes/auth.js'
import people from './routes/people.js'
import searches from './routes/searches.js'
import requests from './routes/requests.js'
import badges from './routes/badges.js'
import review from './routes/review.js'
import demo from './routes/demo.js'
import voice from './routes/voice.js'

const here = path.dirname(fileURLToPath(import.meta.url))

// Every API router. The routes test walks this list to make sure each route is covered.
export const routers = { auth, people, searches, requests, badges, review, demo, voice }

export function createApp() {
  const production = process.env.NODE_ENV === 'production'
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1) // nginx sits in front and sends X-Forwarded-Proto

  if (production && !process.env.SESSION_SECRET) {
    console.warn('Warning: SESSION_SECRET is empty. Run: npm run setup --prefix server')
  }

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'microphone=(self), camera=(self)',
    })
    // Contact request photos must never sit in a shared laptop's cache.
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store')
    next()
  })

  app.use(express.json())
  app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: production, maxAge: 12 * 60 * 60 * 1000 },
  }))

  // Login and shelter list are public. Everything after the guard needs a session.
  app.use('/api', auth)
  app.use('/api', (req, res, next) => {
    if (!req.session.shelterId) return res.status(401).json({ error: 'Please log in.' })
    next()
  })
  for (const router of [people, searches, requests, badges, review, demo, voice]) app.use('/api', router)

  // In production the React build is served from here too.
  const dist = path.join(here, '..', 'client', 'dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
      res.sendFile(path.join(dist, 'index.html'))
    })
  }

  app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })

  return app
}
