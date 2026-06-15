import db from '../db.js'
import wsService from './WSService.js'

class SensorService {
  private intervalId: ReturnType<typeof setInterval> | null = null

  start() {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.tick(), 3000)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private tick() {
    const pots = db.getPots()
    const count = Math.floor(Math.random() * 5) + 3
    const shuffled = pots.sort(() => Math.random() - 0.5).slice(0, count)

    for (const pot of shuffled) {
      if (pot.status === 'spraying') continue

      const drift = (Math.random() - 0.5) * 4
      const newMoisture = Math.round(Math.max(0, Math.min(100, pot.currentMoisture + drift)))
      pot.currentMoisture = newMoisture

      db.addMoistureReading(pot.id, newMoisture)

      if (newMoisture < pot.lowerThreshold) {
        if (pot.status !== 'warning') {
          pot.status = 'warning'
          db.addAlert(pot.id, 'low_moisture', `花盆 ${pot.id} 湿度 ${newMoisture}% 低于下限 ${pot.lowerThreshold}%`)
          wsService.broadcast({ type: 'alert', data: { potId: pot.id, moisture: newMoisture } })
        }
      } else if (newMoisture >= pot.lowerThreshold) {
        if (pot.status === 'warning') {
          pot.status = 'normal'
        }
      }

      db.updatePot(pot.id, { currentMoisture: newMoisture, status: pot.status })
    }

    wsService.broadcast({
      type: 'moisture_update',
      data: shuffled.map((p) => ({ id: p.id, moisture: p.currentMoisture, status: p.status })),
    })
  }
}

const sensorService = new SensorService()
export default sensorService
