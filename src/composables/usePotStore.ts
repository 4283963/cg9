import { reactive, computed } from 'vue'

export interface Pot {
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

export interface MoistureReading {
  potId: string
  moisture: number
  timestamp: string
}

export interface Alert {
  id: string
  potId: string
  type: string
  message: string
  timestamp: string
  resolved: boolean
}

export interface OperationLog {
  id: string
  potId: string
  action: string
  operator: string
  timestamp: string
  details?: string
}

export interface ThresholdConfig {
  lowerBound: number
  upperBound: number
}

export interface GravityConfig {
  enabled: boolean
  dampingFactors: number[]
}

interface GravitySprayInfo {
  potId: string
  dampingFactor: number
  adjustedDuration: number
  originalDuration: number
  triggerSource: string
}

interface PotStoreState {
  pots: Map<string, Pot>
  selectedPotId: string | null
  alerts: Alert[]
  logs: OperationLog[]
  thresholds: ThresholdConfig
  gravityConfig: GravityConfig
  history: MoistureReading[]
  gravitySprayInfos: Map<string, GravitySprayInfo>
}

const state = reactive<PotStoreState>({
  pots: new Map(),
  selectedPotId: null,
  alerts: [],
  logs: [],
  thresholds: { lowerBound: 40, upperBound: 70 },
  gravityConfig: { enabled: false, dampingFactors: [0, 0.2, 0.4] },
  history: [],
  gravitySprayInfos: new Map(),
})

const selectedPot = computed(() => {
  if (!state.selectedPotId) return null
  return state.pots.get(state.selectedPotId) ?? null
})

const normalCount = computed(() => {
  let count = 0
  for (const pot of state.pots.values()) {
    if (pot.status === 'normal') count++
  }
  return count
})

const warningCount = computed(() => {
  let count = 0
  for (const pot of state.pots.values()) {
    if (pot.status === 'warning') count++
  }
  return count
})

const sprayingCount = computed(() => {
  let count = 0
  for (const pot of state.pots.values()) {
    if (pot.status === 'spraying') count++
  }
  return count
})

const totalCount = computed(() => state.pots.size)

async function fetchPots() {
  try {
    const res = await fetch('/api/pots')
    const json = await res.json()
    if (json.success && Array.isArray(json.data)) {
      const newMap = new Map<string, Pot>()
      for (const pot of json.data) {
        newMap.set(pot.id, pot)
      }
      state.pots = newMap
    }
  } catch {}
}

async function fetchPotDetail(id: string) {
  try {
    const res = await fetch(`/api/pots/${id}`)
    const json = await res.json()
    if (json.success && json.data) {
      state.pots.set(id, json.data)
    }
  } catch {}
}

async function fetchHistory(id: string) {
  try {
    const res = await fetch(`/api/pots/${id}/history?limit=50`)
    const json = await res.json()
    if (json.success && Array.isArray(json.data)) {
      state.history = json.data
    }
  } catch {}
}

async function triggerSpray(id: string, duration = 3000) {
  try {
    const res = await fetch(`/api/pots/${id}/spray`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration }),
    })
    const json = await res.json()
    if (json.success && json.data) {
      if (json.data.primary) {
        state.pots.set(json.data.primary.id, json.data.primary)
      }
      if (Array.isArray(json.data.triggeredPots)) {
        for (const t of json.data.triggeredPots) {
          if (!t.isOriginal) {
            state.gravitySprayInfos.set(t.potId, {
              potId: t.potId,
              dampingFactor: t.dampingFactor,
              adjustedDuration: t.duration,
              originalDuration: duration,
              triggerSource: id,
            })
          }
        }
      }
      await fetchPots()
    }
  } catch {}
}

async function stopSpray(id: string) {
  try {
    const res = await fetch(`/api/pots/${id}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const json = await res.json()
    if (json.success && json.data) {
      state.pots.set(id, json.data)
      state.gravitySprayInfos.delete(id)
    }
  } catch {}
}

async function fetchAlerts() {
  try {
    const res = await fetch('/api/alerts?limit=50')
    const json = await res.json()
    if (json.success && Array.isArray(json.data)) {
      state.alerts = json.data
    }
  } catch {}
}

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs?limit=50')
    const json = await res.json()
    if (json.success && Array.isArray(json.data)) {
      state.logs = json.data
    }
  } catch {}
}

async function fetchThresholds() {
  try {
    const res = await fetch('/api/config/thresholds')
    const json = await res.json()
    if (json.success && json.data) {
      state.thresholds = json.data
    }
  } catch {}
}

async function updateThresholds(lower: number, upper: number) {
  try {
    const res = await fetch('/api/config/thresholds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lowerBound: lower, upperBound: upper }),
    })
    const json = await res.json()
    if (json.success && json.data) {
      state.thresholds = json.data
      await fetchPots()
    }
  } catch {}
}

function updatePotFromWS(potId: string, moisture: number, status: string) {
  const pot = state.pots.get(potId)
  if (pot) {
    pot.currentMoisture = moisture
    if (status === 'normal' || status === 'warning' || status === 'spraying') {
      pot.status = status
    }
  }
}

function batchUpdateFromWS(updates: Array<{ id: string; moisture: number; status: string }>) {
  for (const u of updates) {
    const pot = state.pots.get(u.id)
    if (pot) {
      pot.currentMoisture = u.moisture
      if (u.status === 'normal' || u.status === 'warning' || u.status === 'spraying') {
        pot.status = u.status
      }
    }
  }
}

function batchUpdateSprayStatus(updates: Array<{ potId: string; status: string; action: string }>) {
  for (const u of updates) {
    const pot = state.pots.get(u.potId)
    if (pot && (u.status === 'normal' || u.status === 'warning' || u.status === 'spraying')) {
      pot.status = u.status
    }
  }
}

function setSprayStatus(potId: string, status: string, _action: string) {
  const pot = state.pots.get(potId)
  if (pot && (status === 'normal' || status === 'warning' || status === 'spraying')) {
    pot.status = status
  }
}

function addAlert(alert: Alert) {
  state.alerts.unshift(alert)
}

async function fetchGravityConfig() {
  try {
    const res = await fetch('/api/config/gravity')
    const json = await res.json()
    if (json.success && json.data) {
      state.gravityConfig = json.data
    }
  } catch {}
}

async function setGravityEnabled(enabled: boolean) {
  try {
    const res = await fetch('/api/config/gravity/enabled', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    const json = await res.json()
    if (json.success && json.data) {
      state.gravityConfig = json.data
    }
  } catch {}
}

async function setGravityFactors(factors: number[]) {
  try {
    const res = await fetch('/api/config/gravity/factors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factors }),
    })
    const json = await res.json()
    if (json.success && json.data) {
      state.gravityConfig = json.data
    }
  } catch {}
}

function setGravitySprayInfo(potId: string, info: GravitySprayInfo) {
  state.gravitySprayInfos.set(potId, info)
}

function clearGravitySprayInfo(potId: string) {
  state.gravitySprayInfos.delete(potId)
}

export function usePotStore() {
  return {
    state,
    selectedPot,
    normalCount,
    warningCount,
    sprayingCount,
    totalCount,
    fetchPots,
    fetchPotDetail,
    fetchHistory,
    triggerSpray,
    stopSpray,
    fetchAlerts,
    fetchLogs,
    fetchThresholds,
    updateThresholds,
    fetchGravityConfig,
    setGravityEnabled,
    setGravityFactors,
    setGravitySprayInfo,
    clearGravitySprayInfo,
    updatePotFromWS,
    batchUpdateFromWS,
    batchUpdateSprayStatus,
    setSprayStatus,
    addAlert,
  }
}
