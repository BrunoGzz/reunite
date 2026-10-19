import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/shelters', (req, res) => {
  res.json(db.prepare('SELECT id, name FROM shelters ORDER BY name').all())
})

// There is no login. This only chooses which shelter, and which role, the session acts as.
router.post('/session', (req, res) => {
  const { shelterId, role } = req.body
  const shelter = db.prepare('SELECT id, name FROM shelters WHERE id = ?').get(shelterId)
  if (!shelter || !['volunteer', 'coordinator'].includes(role)) {
    return res.status(400).json({ error: 'Choose a shelter and a role.' })
  }
  req.session.shelterId = shelter.id
  req.session.role = role
  res.json({ shelterId: shelter.id, shelterName: shelter.name, role })
})

router.get('/me', (req, res) => {
  if (!req.session.shelterId) return res.status(401).json({ error: 'No shelter chosen' })
  const shelter = db.prepare('SELECT name FROM shelters WHERE id = ?').get(req.session.shelterId)
  res.json({ shelterId: req.session.shelterId, shelterName: shelter.name, role: req.session.role })
})

export default router
