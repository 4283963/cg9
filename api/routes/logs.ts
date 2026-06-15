import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

router.get('/alerts', (req: Request, res: Response): void => {
  const limit = parseInt(req.query.limit as string) || 50
  const alerts = db.getAlerts(limit)
  res.json({ success: true, data: alerts })
})

router.get('/logs', (req: Request, res: Response): void => {
  const limit = parseInt(req.query.limit as string) || 50
  const logs = db.getLogs(limit)
  res.json({ success: true, data: logs })
})

export default router
