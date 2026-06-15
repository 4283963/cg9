import { Router, type Request, type Response } from 'express'
import db from '../db.js'
import sprayService from '../services/SprayService.js'

const router = Router()

router.get('/', (_req: Request, res: Response): void => {
  const pots = db.getPots()
  res.json({ success: true, data: pots })
})

router.get('/:id', (req: Request, res: Response): void => {
  const pot = db.getPot(req.params.id)
  if (!pot) {
    res.status(404).json({ success: false, error: '花盆未找到' })
    return
  }
  res.json({ success: true, data: pot })
})

router.get('/:id/history', (req: Request, res: Response): void => {
  const pot = db.getPot(req.params.id)
  if (!pot) {
    res.status(404).json({ success: false, error: '花盆未找到' })
    return
  }
  const limit = parseInt(req.query.limit as string) || 50
  const history = db.getMoistureHistory(req.params.id, limit)
  res.json({ success: true, data: history })
})

router.post('/:id/spray', (req: Request, res: Response): void => {
  const pot = db.getPot(req.params.id)
  if (!pot) {
    res.status(404).json({ success: false, error: '花盆未找到' })
    return
  }
  const duration = (req.body as { duration?: number }).duration ?? 3000
  const result = sprayService.triggerSpray(req.params.id, duration, 'manual')
  res.json({ success: true, data: result })
})

router.post('/:id/stop', (req: Request, res: Response): void => {
  const pot = db.getPot(req.params.id)
  if (!pot) {
    res.status(404).json({ success: false, error: '花盆未找到' })
    return
  }
  const result = sprayService.stopSpray(req.params.id)
  res.json({ success: true, data: result })
})

export default router
