import { Router } from 'express'
import db from '../db.js'
import { addPerson, addSearch, runSearch, resultCard, SHOW_MIN } from '../engine.js'

const router = Router()

function resultsFor(searchId) {
  const matches = db.prepare(
    "SELECT * FROM matches WHERE search_id = ? AND score >= ? AND state != 'rejected' ORDER BY score DESC"
  ).all(searchId, SHOW_MIN)
  return matches.map(resultCard)
}

// Creates a search. The searcher is either an existing person or a new one with minimum fields.
router.post('/searches', (req, res) => {
  const { searcherPersonId, searcher, target, email, emailOptIn } = req.body
  let searcherId = searcherPersonId
  if (!searcherId) {
    if (!searcher || (!searcher.name && !searcher.age)) {
      return res.status(400).json({ error: 'Tell us who is looking: at least a name or an age.' })
    }
    searcherId = addPerson(searcher, req.session.shelterId).id
  }
  const search = addSearch({ shelterId: req.session.shelterId, searcherPersonId: searcherId, target, email, emailOptIn })
  runSearch(search)
  res.json({ search, results: resultsFor(search.id) })
})

// This shelter's open searches, for the "Open searches" list. A request that was sent is always
// reported as sent (pending), whether or not it was declined, so a decline stays invisible.
router.get('/searches', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.name, s.sex, s.age, s.last_place, s.created_at, p.name AS searcher_name,
      (SELECT COUNT(*) FROM matches m WHERE m.search_id = s.id AND m.score >= @min AND m.state != 'rejected') AS match_count,
      (SELECT MAX(m.score) FROM matches m WHERE m.search_id = s.id AND m.score >= @min AND m.state != 'rejected') AS best_score,
      EXISTS (SELECT 1 FROM contact_requests r JOIN matches m ON m.id = r.match_id WHERE m.search_id = s.id) AS request_sent
    FROM searches s JOIN people p ON p.id = s.searcher_person_id
    WHERE s.shelter_id = @shelter AND s.status = 'open' ORDER BY s.created_at DESC, s.id DESC
  `).all({ min: SHOW_MIN, shelter: req.session.shelterId })
  res.json(rows.map((r) => ({ ...r, request_sent: !!r.request_sent })))
})

router.get('/searches/:id', (req, res) => {
  const search = db.prepare('SELECT * FROM searches WHERE id = ? AND shelter_id = ?').get(req.params.id, req.session.shelterId)
  if (!search) return res.status(404).json({ error: 'Search not found' })
  res.json({ search, results: resultsFor(search.id) })
})

export default router
