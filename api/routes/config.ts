import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

router.get('/thresholds', (_req: Request, res: Response): void => {
  const thresholds = db.getThresholds()
  res.json({ success: true, data: thresholds })
})

router.put('/thresholds', (req: Request, res: Response): void => {
  const { lowerBound, upperBound } = req.body as { lowerBound: number; upperBound: number }
  if (typeof lowerBound !== 'number' || typeof upperBound !== 'number') {
    res.status(400).json({ success: false, error: '需要提供 lowerBound 和 upperBound 数值' })
    return
  }
  if (lowerBound >= upperBound) {
    res.status(400).json({ success: false, error: '下限必须小于上限' })
    return
  }
  if (lowerBound < 0 || upperBound > 100) {
    res.status(400).json({ success: false, error: '阈值范围应在 0-100 之间' })
    return
  }
  const thresholds = db.updateThresholds(lowerBound, upperBound)
  res.json({ success: true, data: thresholds })
})

export default router
