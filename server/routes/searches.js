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

const UNREAD = "n.is_read = 0 AND n.kind IN ('match_alert', 'reunion')"

function shelterInfo(id) {
  return db.prepare('SELECT name, address, phone, instructions FROM shelters WHERE id = ?').get(id)
}

// One card per search from this shelter, open or closed. A card holds everything about its search: the best
// score, a sent request, and the reunion. A request that was sent always reads as sent (pending), whether
// or not it was declined, so a decline stays invisible. New activity (an unread alert) puts the card first.
router.get('/searches', (req, res) => {
  const shelter = req.session.shelterId
  const rows = db.prepare(`
    SELECT s.id, s.status, s.name, s.sex, s.age, s.last_place, s.created_at, p.name AS searcher_name,
      (SELECT COUNT(*) FROM matches m WHERE m.search_id = s.id AND m.score >= @min AND m.state != 'rejected') AS match_count,
      (SELECT MAX(m.score) FROM matches m WHERE m.search_id = s.id AND m.score >= @min AND m.state != 'rejected') AS best_score,
      EXISTS (SELECT 1 FROM contact_requests r JOIN matches m ON m.id = r.match_id WHERE m.search_id = s.id) AS request_sent,
      EXISTS (SELECT 1 FROM contact_requests r JOIN matches m ON m.id = r.match_id JOIN people q ON q.id = m.person_id
              WHERE m.search_id = s.id AND q.shelter_id = @shelter) AS also_here,
      EXISTS (SELECT 1 FROM notifications n JOIN matches m ON m.id = n.match_id
              WHERE m.search_id = s.id AND n.shelter_id = @shelter AND ${UNREAD}) AS new_activity
    FROM searches s JOIN people p ON p.id = s.searcher_person_id
    WHERE s.shelter_id = @shelter
    ORDER BY new_activity DESC, s.created_at DESC, s.id DESC
  `).all({ min: SHOW_MIN, shelter })

  const cards = rows.map((r) => {
    const card = { ...r, request_sent: !!r.request_sent, also_here: !!r.also_here, new_activity: !!r.new_activity, reunion: null, email: null }
    const connected = db.prepare(`
      SELECT m.id, p.name, p.shelter_id FROM matches m JOIN people p ON p.id = m.person_id
      WHERE m.search_id = ? AND m.state = 'connected' LIMIT 1
    `).get(r.id)
    if (connected) {
      card.reunion = { person_name: connected.name, shelter: shelterInfo(connected.shelter_id) }
      const email = db.prepare("SELECT text FROM notifications WHERE kind = 'email' AND match_id = ? ORDER BY id DESC LIMIT 1").get(connected.id)
      card.email = email ? email.text : null
    }
    return card
  })
  res.json(cards)
})

// Opening a search's results clears its "new" highlight.
router.post('/searches/:id/seen', (req, res) => {
  const search = db.prepare('SELECT id FROM searches WHERE id = ? AND shelter_id = ?').get(req.params.id, req.session.shelterId)
  if (!search) return res.status(404).json({ error: 'Search not found' })
  db.prepare(`
    UPDATE notifications SET is_read = 1
    WHERE shelter_id = ? AND kind IN ('match_alert', 'reunion')
      AND match_id IN (SELECT id FROM matches WHERE search_id = ?)
  `).run(req.session.shelterId, search.id)
  res.json({ ok: true })
})

router.get('/searches/:id', (req, res) => {
  const search = db.prepare('SELECT * FROM searches WHERE id = ? AND shelter_id = ?').get(req.params.id, req.session.shelterId)
  if (!search) return res.status(404).json({ error: 'Search not found' })
  res.json({ search, results: resultsFor(search.id) })
})

export default router
