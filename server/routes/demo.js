import { Router } from 'express'
import db from '../db.js'
import { addPerson, matchNewPerson } from '../engine.js'
import { resetDemo, LATE_ARRIVAL } from '../seed.js'

const router = Router()

// Registers the husband who was "rescued later", so the automatic alert for his wife's search shows up live.
router.post('/demo/late-arrival', (req, res) => {
  const shelter = db.prepare('SELECT id FROM shelters WHERE name = ?').get(LATE_ARRIVAL.shelter)
  matchNewPerson(addPerson(LATE_ARRIVAL.person, shelter.id))
  res.json({ ok: true, name: LATE_ARRIVAL.person.name, shelter: LATE_ARRIVAL.shelter })
})

router.post('/demo/reset', (req, res) => {
  resetDemo()
  res.json({ ok: true })
})

export default router
