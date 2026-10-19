import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import db, { now, photoDir } from '../db.js'
import { createRequest, acceptRequest, reunionForReceiver, deletePhoto, needsPhoto, mayDecide, approveMatch, rejectMatch } from '../engine.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

function savePhoto(file) {
  if (!file || !file.mimetype.startsWith('image/')) return null
  const name = crypto.randomBytes(16).toString('hex')
  fs.writeFileSync(path.join(photoDir, name), file.buffer)
  return name
}

// A volunteer sends a contact request from a search result.
router.post('/matches/:id/request', upload.single('photo'), (req, res) => {
  const match = db.prepare(`
    SELECT m.* FROM matches m JOIN searches s ON s.id = m.search_id
    WHERE m.id = ? AND s.shelter_id = ?
  `).get(req.params.id, req.session.shelterId)
  if (!match) return res.status(404).json({ error: 'Result not found' })

  const photo = req.file && req.file.mimetype.startsWith('image/') ? req.file : null
  if (!photo && needsPhoto(match)) return res.status(400).json({ error: 'Please take or upload a photo.' })

  const id = createRequest({ match, message: req.body.message, photo })
  res.json({ id })
})

// Everything about people registered at this shelter that someone else started, and that only this shelter sees:
// - contact requests waiting for a decision (for minors and people who cannot decide alone too: the volunteer decides);
// - possible matches where a name is missing, to confirm or dismiss;
// - the requests that were accepted, with where the family is.
// Declined requests are not listed: one dropped after an earlier decline is stored as declined too, and must never
// show up here. A pending request does not carry the sender's shelter, so where a family is stays hidden until accept.
router.get('/incoming', (req, res) => {
  const shelter = req.session.shelterId
  const base = `
    SELECT r.id, r.message, r.photo_file IS NOT NULL AS has_photo, r.created_at, r.from_shelter_id,
      r.from_shelter_id = r.to_shelter_id AS sender_here, target.name AS person_name, target.is_minor, target.needs_assistance,
      searcher.name AS searcher_name
    FROM contact_requests r
    JOIN matches m ON m.id = r.match_id
    JOIN people target ON target.id = m.person_id
    JOIN searches s ON s.id = m.search_id
    JOIN people searcher ON searcher.id = s.searcher_person_id
    WHERE r.to_shelter_id = ?`
  const pending = db.prepare(base + " AND r.status = 'pending' ORDER BY r.created_at").all(shelter)
    .map(({ from_shelter_id, ...r }) => ({ ...r, sender_here: !!r.sender_here }))
  const accepted = db.prepare(base + " AND r.status = 'accepted' ORDER BY r.decided_at DESC").all(shelter)
    .map(({ from_shelter_id, ...r }) => ({ ...r, sender_here: !!r.sender_here, reunion: { person_name: r.searcher_name, shelter: db.prepare('SELECT name, address, phone, instructions FROM shelters WHERE id = ?').get(from_shelter_id) } }))

  // Neither the searcher nor the searcher's shelter is included: only what the family describes.
  const toConfirm = db.prepare(`
    SELECT m.id, m.score, m.reasons, s.name AS sought_name, s.sex AS sought_sex, s.age AS sought_age, s.last_place AS sought_place,
      p.name AS person_name, p.sex AS person_sex, p.age AS person_age, p.marks AS person_marks, p.last_place AS person_place
    FROM matches m JOIN searches s ON s.id = m.search_id JOIN people p ON p.id = m.person_id
    WHERE m.state = 'needs_review' AND p.shelter_id = ? ORDER BY m.score DESC, m.id
  `).all(shelter).map((m) => ({ ...m, reasons: JSON.parse(m.reasons) }))
  res.json({ pending, toConfirm, accepted })
})

// Confirming or dismissing a possible match is for the shelter where the registered person is, and nobody else.
function matchForThisShelter(req, res) {
  const row = db.prepare('SELECT m.state, p.shelter_id FROM matches m JOIN people p ON p.id = m.person_id WHERE m.id = ?').get(req.params.id)
  if (!row || row.state !== 'needs_review') return res.status(404).json({ error: 'Nothing to confirm' }) && null
  if (row.shelter_id !== req.session.shelterId) return res.status(403).json({ error: 'This item is not for your shelter' }) && null
  return row
}

router.post('/matches/:id/confirm', (req, res) => {
  if (!matchForThisShelter(req, res)) return
  approveMatch(req.params.id) // alerts the searcher's shelter
  res.json({ ok: true })
})

router.post('/matches/:id/dismiss', (req, res) => {
  if (!matchForThisShelter(req, res)) return
  rejectMatch(req.params.id)
  res.json({ ok: true })
})

router.post('/requests/:id/decide', (req, res) => {
  const request = db.prepare("SELECT * FROM contact_requests WHERE id = ? AND status = 'pending'").get(req.params.id)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  if (!mayDecide(request, req.session.shelterId)) return res.status(403).json({ error: 'This request is not for you to decide' })

  const accept = req.body.decision === 'accept'
  deletePhoto(request.photo_file)
  db.prepare('UPDATE contact_requests SET status = ?, photo_file = NULL, decided_at = ? WHERE id = ?')
    .run(accept ? 'accepted' : 'declined', now(), request.id)
  if (accept) acceptRequest(request)
  res.json({ ok: true, reunion: accept ? reunionForReceiver(request) : null })
})

// Photos are only served here, never as static files.
router.get('/photos/:id', (req, res) => {
  const request = db.prepare('SELECT * FROM contact_requests WHERE id = ?').get(req.params.id)
  if (!request || !request.photo_file) return res.status(404).end()
  if (!mayDecide(request, req.session.shelterId)) return res.status(403).end()
  res.sendFile(path.join(photoDir, request.photo_file), { cacheControl: false, etag: false, lastModified: false })
})

export default router
