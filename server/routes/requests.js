import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import db, { now, photoDir } from '../db.js'
import { createRequest, acceptRequest, reunionForReceiver, deletePhoto, needsPhoto } from '../engine.js'

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

  const id = createRequest({ match, message: req.body.message, familyDetail: req.body.familyDetail, photo })
  res.json({ id })
})

// Requests that arrived at this shelter (or at the coordinator) and ones this shelter sent.
router.get('/requests', (req, res) => {
  const isCoordinator = req.session.role === 'coordinator'
  const incoming = db.prepare(`
    SELECT r.id, r.message, r.family_detail, r.photo_file IS NOT NULL AS has_photo, r.routed_to, r.created_at,
      target.name AS person_name, target.is_minor, target.needs_assistance, searcher.name AS searcher_name
    FROM contact_requests r
    JOIN matches m ON m.id = r.match_id
    JOIN people target ON target.id = m.person_id
    JOIN searches s ON s.id = m.search_id
    JOIN people searcher ON searcher.id = s.searcher_person_id
    WHERE r.status = 'pending'
      AND ((r.routed_to = 'shelter' AND r.to_shelter_id = @shelter) OR (r.routed_to = 'coordinator' AND @coordinator = 1))
    ORDER BY r.created_at
  `).all({ shelter: req.session.shelterId, coordinator: isCoordinator ? 1 : 0 })

  const sent = db.prepare(`
    SELECT r.id, r.status, r.created_at, s.name AS sought_name
    FROM contact_requests r JOIN matches m ON m.id = r.match_id JOIN searches s ON s.id = m.search_id
    WHERE r.from_shelter_id = ? ORDER BY r.created_at DESC
  `).all(req.session.shelterId).map((r) => ({ ...r, status: r.status === 'accepted' ? 'accepted' : 'pending' }))

  res.json({ incoming, sent })
})

router.post('/requests/:id/decide', (req, res) => {
  const request = db.prepare("SELECT * FROM contact_requests WHERE id = ? AND status = 'pending'").get(req.params.id)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  const allowed = request.routed_to === 'coordinator'
    ? req.session.role === 'coordinator'
    : request.to_shelter_id === req.session.shelterId
  if (!allowed) return res.status(403).json({ error: 'This request is not for you' })

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
  const allowed = req.session.role === 'coordinator' || request.to_shelter_id === req.session.shelterId
  if (!allowed) return res.status(403).end()
  res.sendFile(path.join(photoDir, request.photo_file), { cacheControl: false, etag: false, lastModified: false })
})

export default router
