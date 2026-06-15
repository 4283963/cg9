import db from '../db.js'
import wsService from './WSService.js'

interface GravityTriggerResult {
  potId: string
  adjustedDuration: number
  dampingFactor: number
  originalDuration: number
}

class SprayService {
  private sprayTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private moistureTimers: Map<string, ReturnType<typeof setInterval>> = new Map()

  triggerSpray(potId: string, duration = 3000, operator = 'manual') {
    const pot = db.getPot(potId)
    if (!pot) return null
    if (pot.status === 'spraying') return pot

    const gravityConfig = db.getGravityConfig()
    const triggeredPots: GravityTriggerResult[] = []

    triggeredPots.push({
      potId,
      adjustedDuration: duration,
      dampingFactor: 0,
      originalDuration: duration,
    })

    if (gravityConfig.enabled && pot.row === 1) {
      const verticalNeighbors = db.getVerticalNeighbors(pot.row, pot.col, 2)
      for (const neighborId of verticalNeighbors) {
        const neighbor = db.getPot(neighborId)
        if (neighbor && neighbor.status !== 'spraying') {
          const neighborRow = neighbor.row
          const dampingFactor = db.getDampingFactor(neighborRow, pot.row)
          const adjustedDuration = Math.round(duration * (1 - dampingFactor))
          triggeredPots.push({
            potId: neighborId,
            adjustedDuration,
            dampingFactor,
            originalDuration: duration,
          })
        }
      }
    }

    const results: Array<{ potId: string; duration: number; dampingFactor: number; isOriginal: boolean }> = []

    for (const trigger of triggeredPots) {
      const targetPot = db.getPot(trigger.potId)
      if (!targetPot) continue
      if (targetPot.status === 'spraying') continue

      db.updatePot(trigger.potId, {
        status: 'spraying',
        lastSprayTime: new Date().toISOString(),
        sprayCount: targetPot.sprayCount + 1,
      })

      const isOriginal = trigger.potId === potId
      const dampingInfo = isOriginal
        ? `原始触发，持续 ${trigger.adjustedDuration}ms`
        : `重力协同触发，阻尼系数 ${trigger.dampingFactor * 100}%，调整后持续 ${trigger.adjustedDuration}ms（原 ${trigger.originalDuration}ms）`

      db.addLog(trigger.potId, 'spray_start', operator, dampingInfo)
      db.addAlert(trigger.potId, 'spray_start', `花盆 ${trigger.potId} 开始喷淋 - ${dampingInfo}`)

      wsService.broadcast({
        type: 'spray_status',
        data: {
          potId: trigger.potId,
          status: 'spraying',
          action: 'start',
          gravityTriggered: !isOriginal,
          dampingFactor: trigger.dampingFactor,
          originalDuration: trigger.originalDuration,
          adjustedDuration: trigger.adjustedDuration,
          triggerSource: potId,
        },
      })

      this.startMoistureLoop(trigger.potId)

      const timer = setTimeout(() => {
        this.stopSpray(trigger.potId)
      }, trigger.adjustedDuration)
      this.sprayTimers.set(trigger.potId, timer)

      results.push({
        potId: trigger.potId,
        duration: trigger.adjustedDuration,
        dampingFactor: trigger.dampingFactor,
        isOriginal,
      })
    }

    return {
      primary: db.getPot(potId),
      triggeredPots: results,
    }
  }

  private startMoistureLoop(potId: string) {
    if (this.moistureTimers.has(potId)) return

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
