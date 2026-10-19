import { Router } from 'express'
import db from '../db.js'

const router = Router()

// Everything for the "Needs your attention" page and the sidebar badges. The frontend polls this every 15 seconds.
router.get('/attention', (req, res) => {
  const shelter = req.session.shelterId
  const alerts = db.prepare(`
    SELECT n.id, n.kind, n.text, n.match_id, n.created_at, m.search_id
    FROM notifications n LEFT JOIN matches m ON m.id = n.match_id
    WHERE n.is_read = 0 AND n.kind IN ('match_alert', 'reunion') AND n.shelter_id = ?
    ORDER BY n.created_at DESC, n.id DESC
  `).all(shelter)

  const pendingRequests = db.prepare(`
    SELECT COUNT(*) AS n FROM contact_requests WHERE status = 'pending' AND routed_to = 'shelter' AND to_shelter_id = ?
  `).get(shelter).n

  const reviewCount = db.prepare("SELECT COUNT(*) AS n FROM matches WHERE state = 'needs_review'").get().n
    + db.prepare("SELECT COUNT(*) AS n FROM contact_requests WHERE status = 'pending' AND routed_to = 'review'").get().n

  // The simulated emails sent for this shelter's searches.
  const emails = db.prepare("SELECT text, created_at FROM notifications WHERE kind = 'email' AND shelter_id = ? ORDER BY id DESC LIMIT 5").all(shelter)
  res.json({ alerts, pendingRequests, reviewCount, emails })
})

router.post('/notifications/:id/read', (req, res) => {
  const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND shelter_id = ?').run(req.params.id, req.session.shelterId)
  if (!result.changes) return res.status(404).json({ error: 'Notification not found' })
  res.json({ ok: true })
})

export default router
