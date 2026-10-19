import { Router } from 'express'
import db from '../db.js'

const router = Router()

// Everything the dashboard needs in one call. The frontend polls this every 15 seconds.
router.get('/dashboard', (req, res) => {
  const isCoordinator = req.session.role === 'coordinator' ? 1 : 0
  const alerts = db.prepare(`
    SELECT n.id, n.kind, n.text, n.match_id, n.request_id, n.created_at, m.search_id
    FROM notifications n LEFT JOIN matches m ON m.id = n.match_id
    WHERE n.is_read = 0 AND n.kind IN ('match_alert', 'reunion', 'review_needed')
      AND (n.shelter_id = @shelter OR (n.shelter_id IS NULL AND @coordinator = 1 AND n.kind = 'review_needed'))
    ORDER BY n.created_at DESC
  `).all({ shelter: req.session.shelterId, coordinator: isCoordinator })

  const pendingRequests = db.prepare(`
    SELECT COUNT(*) AS n FROM contact_requests
    WHERE status = 'pending'
      AND ((routed_to = 'shelter' AND to_shelter_id = @shelter) OR (routed_to = 'coordinator' AND @coordinator = 1))
  `).get({ shelter: req.session.shelterId, coordinator: isCoordinator }).n

  const emails = db.prepare("SELECT text, created_at FROM notifications WHERE kind IN ('email','sms') ORDER BY id DESC LIMIT 3").all()
  res.json({ alerts, pendingRequests, emails })
})

router.post('/notifications/:id/read', (req, res) => {
  const result = db.prepare(`
    UPDATE notifications SET is_read = 1
    WHERE id = @id AND (shelter_id = @shelter OR (shelter_id IS NULL AND @coordinator = 1))
  `).run({ id: req.params.id, shelter: req.session.shelterId, coordinator: req.session.role === 'coordinator' ? 1 : 0 })
  if (!result.changes) return res.status(404).json({ error: 'Notification not found' })
  res.json({ ok: true })
})

export default router
