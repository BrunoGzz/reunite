import { Router } from 'express'
import db from '../db.js'
import { addPerson, matchNewPerson } from '../engine.js'

const router = Router()

router.get('/people', (req, res) => {
  res.json(db.prepare('SELECT * FROM people WHERE shelter_id = ? ORDER BY created_at DESC, id DESC').all(req.session.shelterId))
})

router.post('/people', (req, res) => {
  const person = addPerson(req.body, req.session.shelterId)
  matchNewPerson(person)
  res.json(person)
})

// Autocomplete for places already in the database.
router.get('/places', (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`
  const rows = db.prepare(`
    SELECT place FROM (
      SELECT last_place AS place FROM people UNION
      SELECT last_place FROM searches UNION
      SELECT origin_place FROM group_movements
    ) WHERE place IS NOT NULL AND place LIKE ? ORDER BY place LIMIT 8
  `).all(q)
  res.json(rows.map((r) => r.place))
})

export default router
