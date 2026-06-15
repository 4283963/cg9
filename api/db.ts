interface Pot {
  id: string
  row: number
  col: number
  currentMoisture: number
  lowerThreshold: number
  upperThreshold: number
  status: 'normal' | 'warning' | 'spraying'
  lastSprayTime: string | null
  sprayCount: number
}

interface MoistureReading {
  potId: string
  moisture: number
  timestamp: string
}

interface OperationLog {
  id: string
  potId: string
  action: string
  operator: string
  timestamp: string
  details?: string
}

interface Alert {
  id: string
  potId: string
  type: string
  message: string
  timestamp: string
  resolved: boolean
}

interface ThresholdConfig {
  lowerBound: number
  upperBound: number
}

class Database {
  pots: Map<string, Pot> = new Map()
  moistureReadings: MoistureReading[] = []
  operationLogs: OperationLog[] = []
  alerts: Alert[] = []
  thresholdConfig: ThresholdConfig = { lowerBound: 40, upperBound: 70 }
  private logCounter = 0
  private alertCounter = 0

  constructor() {
    this.initPots()
  }

  private initPots() {
    for (let row = 1; row <= 8; row++) {
      for (let col = 1; col <= 6; col++) {
        const id = `R${row}C${col}`
        const moisture = Math.round(Math.random() * 50 + 30)
        this.pots.set(id, {
          id,
          row,
          col,
          currentMoisture: moisture,
          lowerThreshold: this.thresholdConfig.lowerBound,
          upperThreshold: this.thresholdConfig.upperBound,
          status: this.getStatus(moisture),
          lastSprayTime: null,
          sprayCount: 0,
        })
      }
    }
  }

  private getStatus(moisture: number, lower?: number): 'normal' | 'warning' {
    const lb = lower ?? this.thresholdConfig.lowerBound
    return moisture < lb ? 'warning' : 'normal'
  }

  getPots(): Pot[] {
    return Array.from(this.pots.values())
  }

  getPot(id: string): Pot | undefined {
    return this.pots.get(id)
  }

  addMoistureReading(potId: string, moisture: number): MoistureReading {
    const reading: MoistureReading = {
      potId,
      moisture,
      timestamp: new Date().toISOString(),
    }
    this.moistureReadings.push(reading)
    return reading
  }

  getMoistureHistory(potId: string, limit = 50): MoistureReading[] {
    return this.moistureReadings
      .filter((r) => r.potId === potId)
      .slice(-limit)
  }

  addLog(potId: string, action: string, operator: string, details?: string): OperationLog {
    this.logCounter++
    const log: OperationLog = {
      id: String(this.logCounter),
      potId,
      action,
      operator,
      timestamp: new Date().toISOString(),
      details,
    }
    this.operationLogs.push(log)
    return log
  }

  addAlert(potId: string, type: string, message: string): Alert {
    this.alertCounter++
    const alert: Alert = {
      id: String(this.alertCounter),
      potId,
      type,
      message,
      timestamp: new Date().toISOString(),
      resolved: false,
    }
    this.alerts.push(alert)
    return alert
  }

  getAlerts(limit = 50): Alert[] {
    return this.alerts.slice(-limit).reverse()
  }

  getLogs(limit = 50): OperationLog[] {
    return this.operationLogs.slice(-limit).reverse()
  }

  updatePot(id: string, updates: Partial<Pot>): Pot | undefined {
    const pot = this.pots.get(id)
    if (!pot) return undefined
    Object.assign(pot, updates)
    return pot
  }

  getThresholds(): ThresholdConfig {
    return { ...this.thresholdConfig }
  }

  updateThresholds(lowerBound: number, upperBound: number): ThresholdConfig {
    this.thresholdConfig = { lowerBound, upperBound }
    for (const pot of this.pots.values()) {
      pot.lowerThreshold = lowerBound
      pot.upperThreshold = upperBound
      if (pot.status !== 'spraying') {
        pot.status = this.getStatus(pot.currentMoisture, lowerBound)
      }
    }
    return this.getThresholds()
  }
}

const db = new Database()
export default db
