import { Router } from 'express'
import db, { now } from '../db.js'
import { approveMatch, rejectMatch, addPerson, matchNewPerson } from '../engine.js'
import { resetDemo, LATE_ARRIVAL } from '../seed.js'

const router = Router()

// Only for /coordinator paths. Without the path this guard would block every route mounted after this router.
router.use('/coordinator', (req, res, next) => {
  if (req.session.role !== 'coordinator') return res.status(403).json({ error: 'Coordinators only' })
  next()
})

// Doubtful matches (no name on one side). Both sides are shown here, since only coordinators may see them.
router.get('/coordinator/queue', (req, res) => {
  const reviews = db.prepare(`
    SELECT m.id, m.score, m.reasons, s.name AS sought_name, s.sex AS sought_sex, s.age AS sought_age, s.last_place AS sought_place,
      p.name AS person_name, p.sex AS person_sex, p.age AS person_age, p.marks AS person_marks, sh.name AS person_shelter
    FROM matches m JOIN searches s ON s.id = m.search_id JOIN people p ON p.id = m.person_id JOIN shelters sh ON sh.id = p.shelter_id
    WHERE m.state = 'needs_review' ORDER BY m.score DESC
  `).all().map((r) => ({ ...r, reasons: JSON.parse(r.reasons) }))
  res.json({ reviews })
})

router.post('/coordinator/matches/:id/approve', (req, res) => {
  if (!approveMatch(req.params.id)) return res.status(404).json({ error: 'Nothing to approve' })
  res.json({ ok: true })
})

router.post('/coordinator/matches/:id/reject', (req, res) => {
  if (!rejectMatch(req.params.id)) return res.status(404).json({ error: 'Nothing to reject' })
  res.json({ ok: true })
})

router.get('/coordinator/movements', (req, res) => {
  res.json(db.prepare(`
    SELECT g.*, s.name AS destination FROM group_movements g
    JOIN shelters s ON s.id = g.destination_shelter_id ORDER BY g.created_at DESC
  `).all())
})

router.post('/coordinator/movements', (req, res) => {
  const b = req.body
  if (!b.origin_place || !b.destination_shelter_id) return res.status(400).json({ error: 'Origin and destination are needed.' })
  db.prepare(`
    INSERT INTO group_movements (origin_place, departed_day, departed_part, transport, agency, destination_shelter_id, notes, names, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(b.origin_place.trim(), b.departed_day || null, b.departed_part || null, b.transport || null,
    b.agency || null, b.destination_shelter_id, b.notes || null, b.names || null, now())
  res.json({ ok: true })
})

router.post('/coordinator/demo/late-arrival', (req, res) => {
  const shelter = db.prepare('SELECT id FROM shelters WHERE name = ?').get(LATE_ARRIVAL.shelter)
  const person = addPerson(LATE_ARRIVAL.person, shelter.id)
  matchNewPerson(person)
  res.json({ ok: true })
})

router.post('/coordinator/demo/reset', (req, res) => {
  resetDemo()
  res.json({ ok: true })
})

export default router
