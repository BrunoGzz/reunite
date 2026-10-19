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

  // Looking for people here: requests waiting for a decision about someone registered at this shelter, plus
  // possible matches for its people that need confirming. Nothing here is counted for any other shelter.
  const incoming = one("SELECT COUNT(*) AS n FROM contact_requests WHERE status = 'pending' AND to_shelter_id = @shelter", { shelter })
    + one("SELECT COUNT(*) AS n FROM matches m JOIN people p ON p.id = m.person_id WHERE m.state = 'needs_review' AND p.shelter_id = @shelter", { shelter })

  const people = one('SELECT COUNT(*) AS n FROM people WHERE shelter_id = @shelter', { shelter })
  res.json({ searches, incoming, people })
})

export default router
