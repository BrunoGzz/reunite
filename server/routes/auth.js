import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/shelters', (req, res) => {
  res.json(db.prepare('SELECT id, name FROM shelters ORDER BY name').all())
})

// Placeholder login: any shelter and role, one shared demo password.
router.post('/login', (req, res) => {
  const { shelterId, role, password } = req.body
  const shelter = db.prepare('SELECT id, name FROM shelters WHERE id = ?').get(shelterId)
  if (!shelter || !['volunteer', 'coordinator'].includes(role)) {
    return res.status(400).json({ error: 'Choose a shelter and a role.' })
  }
  if (password !== (process.env.DEMO_PASSWORD || 'dali2026')) {
    return res.status(401).json({ error: 'Wrong password.' })
  }
  req.session.shelterId = shelter.id
  req.session.role = role
  res.json({ shelterId: shelter.id, shelterName: shelter.name, role })
})

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }))
})

router.get('/me', (req, res) => {
  if (!req.session.shelterId) return res.status(401).json({ error: 'Not logged in' })
  const shelter = db.prepare('SELECT name FROM shelters WHERE id = ?').get(req.session.shelterId)
  res.json({ shelterId: req.session.shelterId, shelterName: shelter.name, role: req.session.role })
})

export default router
