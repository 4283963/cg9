import db from '../db.js'
import wsService from './WSService.js'

class SprayService {
  private sprayTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private moistureTimers: Map<string, ReturnType<typeof setInterval>> = new Map()

  triggerSpray(potId: string, duration = 3000, operator = 'manual') {
    const pot = db.getPot(potId)
    if (!pot) return null
    if (pot.status === 'spraying') return pot

    db.updatePot(potId, {
      status: 'spraying',
      lastSprayTime: new Date().toISOString(),
      sprayCount: pot.sprayCount + 1,
    })

    db.addLog(potId, 'spray_start', operator, `喷淋启动，持续 ${duration}ms`)
    db.addAlert(potId, 'spray_start', `花盆 ${potId} 开始喷淋`)

    wsService.broadcast({ type: 'spray_status', data: { potId, status: 'spraying', action: 'start' } })

    const moistureInterval = setInterval(() => {
      const currentPot = db.getPot(potId)
      if (!currentPot || currentPot.status !== 'spraying') {
        clearInterval(moistureInterval)
        this.moistureTimers.delete(potId)
        return
      }
      const newMoisture = Math.round(Math.min(100, currentPot.currentMoisture + 3))
      db.updatePot(potId, { currentMoisture: newMoisture })
      db.addMoistureReading(potId, newMoisture)
      wsService.broadcast({
        type: 'moisture_update',
        data: [{ id: potId, moisture: newMoisture, status: 'spraying' }],
      })

      if (newMoisture >= currentPot.upperThreshold) {
        this.stopSpray(potId)
      }
    }, 500)
    this.moistureTimers.set(potId, moistureInterval)

    const timer = setTimeout(() => {
      this.stopSpray(potId)
    }, duration)
    this.sprayTimers.set(potId, timer)

    return db.getPot(potId)
  }

  stopSpray(potId: string) {
    const pot = db.getPot(potId)
    if (!pot || pot.status !== 'spraying') return null

    const timer = this.sprayTimers.get(potId)
    if (timer) {
      clearTimeout(timer)
      this.sprayTimers.delete(potId)
    }
    const moistureTimer = this.moistureTimers.get(potId)
    if (moistureTimer) {
      clearInterval(moistureTimer)
      this.moistureTimers.delete(potId)
    }

    const newStatus = pot.currentMoisture < pot.lowerThreshold ? 'warning' : 'normal'
    db.updatePot(potId, { status: newStatus })
    db.addLog(potId, 'spray_stop', 'system', `喷淋停止，当前湿度 ${pot.currentMoisture}%`)

    wsService.broadcast({ type: 'spray_status', data: { potId, status: newStatus, action: 'stop' } })

    return db.getPot(potId)
  }
}

const sprayService = new SprayService()
export default sprayService
