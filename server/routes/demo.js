import { Router } from 'express'
import { resetDemo } from '../seed.js'

const router = Router()

router.post('/demo/reset', (req, res) => {
  resetDemo()
  res.json({ ok: true })
})

export default router
