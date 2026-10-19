import { Router } from 'express'
import db from '../db.js'
import { approveMatch, rejectMatch } from '../engine.js'

const router = Router()

// Everything that needs a second pair of eyes: strong matches where a name is missing, and contact
// requests for minors and people who need help deciding.
router.get('/review', (req, res) => {
  const matches = db.prepare(`
    SELECT m.id, m.score, m.reasons, s.name AS sought_name, s.sex AS sought_sex, s.age AS sought_age, s.last_place AS sought_place,
      p.name AS person_name, p.sex AS person_sex, p.age AS person_age, p.marks AS person_marks, p.last_place AS person_place
    FROM matches m JOIN searches s ON s.id = m.search_id JOIN people p ON p.id = m.person_id
    WHERE m.state = 'needs_review' ORDER BY m.score DESC, m.id
  `).all().map((r) => ({ ...r, reasons: JSON.parse(r.reasons) })) // the shelter of the registered person is never included

  const requests = db.prepare(`
    SELECT r.id, r.message, r.photo_file IS NOT NULL AS has_photo, r.routed_to, r.created_at,
      target.name AS person_name, target.is_minor, target.needs_assistance, searcher.name AS searcher_name
    FROM contact_requests r
    JOIN matches m ON m.id = r.match_id
    JOIN people target ON target.id = m.person_id
    JOIN searches s ON s.id = m.search_id
    JOIN people searcher ON searcher.id = s.searcher_person_id
    WHERE r.status = 'pending' AND r.routed_to = 'review' ORDER BY r.created_at
  `).all()
  res.json({ matches, requests })
})

router.post('/review/matches/:id/approve', (req, res) => {
  if (!approveMatch(req.params.id)) return res.status(404).json({ error: 'Nothing to approve' })
  res.json({ ok: true })
})

router.post('/review/matches/:id/reject', (req, res) => {
  if (!rejectMatch(req.params.id)) return res.status(404).json({ error: 'Nothing to reject' })
  res.json({ ok: true })
})

export default router
