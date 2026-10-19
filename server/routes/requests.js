import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import db, { now, photoDir } from '../db.js'
import { createRequest, acceptRequest, reunionForReceiver, deletePhoto, needsPhoto, mayDecide } from '../engine.js'

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

// Contact requests about people registered at this shelter: the ones waiting for a decision, and the ones that
// were accepted (with where the family is). Requests for minors and people who need help deciding are under
// "Needs review" instead. Declined requests are not listed: a request that was dropped after an earlier decline
// is stored as declined too, and must never show up here.
router.get('/incoming', (req, res) => {
  const base = `
    SELECT r.id, r.message, r.photo_file IS NOT NULL AS has_photo, r.routed_to, r.created_at, r.from_shelter_id,
      r.from_shelter_id = r.to_shelter_id AS sender_here, target.name AS person_name, target.is_minor, target.needs_assistance, searcher.name AS searcher_name
    FROM contact_requests r
    JOIN matches m ON m.id = r.match_id
    JOIN people target ON target.id = m.person_id
    JOIN searches s ON s.id = m.search_id
    JOIN people searcher ON searcher.id = s.searcher_person_id
    WHERE r.routed_to = 'shelter' AND r.to_shelter_id = ?`
  // Where a family is stays hidden until the request is accepted, so the sender's shelter is not sent with pending ones.
  const pending = db.prepare(base + " AND r.status = 'pending' ORDER BY r.created_at").all(req.session.shelterId)
    .map(({ from_shelter_id, ...rest }) => ({ ...rest, sender_here: !!rest.sender_here }))
  const accepted = db.prepare(base + " AND r.status = 'accepted' ORDER BY r.decided_at DESC").all(req.session.shelterId)
    .map(({ from_shelter_id, ...r }) => ({ ...r, sender_here: !!r.sender_here, reunion: { person_name: r.searcher_name, shelter: db.prepare('SELECT name, address, phone, instructions FROM shelters WHERE id = ?').get(from_shelter_id) } }))
  res.json({ pending, accepted })
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
