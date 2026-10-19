import { Router } from 'express'
import db from '../db.js'

const router = Router()

// The counts on the sidebar items. The frontend polls this every 15 seconds.
router.get('/badges', (req, res) => {
  const shelter = req.session.shelterId
  const one = (sql, params) => db.prepare(sql).get(params).n

  // Our searches: searches from this shelter with something new (a match alert or a reunion not yet seen).
  const searches = one(`
    SELECT COUNT(DISTINCT s.id) AS n FROM notifications n
    JOIN matches m ON m.id = n.match_id JOIN searches s ON s.id = m.search_id
    WHERE n.is_read = 0 AND n.kind IN ('match_alert', 'reunion') AND n.shelter_id = @shelter AND s.shelter_id = @shelter
  `, { shelter })

  // Looking for people here: requests waiting for a decision about someone registered at this shelter.
  const incoming = one("SELECT COUNT(*) AS n FROM contact_requests WHERE status = 'pending' AND routed_to = 'shelter' AND to_shelter_id = @shelter", { shelter })

  // Needs review: open to every shelter.
  // The requests this shelter sent are not for it to decide, so they are not counted (unless the person is also here).
  const review = one("SELECT COUNT(*) AS n FROM matches WHERE state = 'needs_review'", {})
    + one("SELECT COUNT(*) AS n FROM contact_requests WHERE status = 'pending' AND routed_to = 'review' AND NOT (from_shelter_id = @shelter AND to_shelter_id != @shelter)", { shelter })

  const people = one('SELECT COUNT(*) AS n FROM people WHERE shelter_id = @shelter', { shelter })
  res.json({ searches, incoming, review, people })
})

export default router
