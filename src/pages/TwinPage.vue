<script setup lang="ts">
import { onMounted, computed } from 'vue'
import Scene3D from '@/components/Scene3D.vue'
import StatsBar from '@/components/StatsBar.vue'
import InfoPanel from '@/components/InfoPanel.vue'
import { usePotStore } from '@/composables/usePotStore'
import { useWebSocket, type WSMessage } from '@/composables/useWebSocket'
import type { PotData } from '@/components/Scene3D.vue'

const store = usePotStore()
const ws = useWebSocket()

const potsRecord = computed<Record<string, PotData>>(() => {
  const record: Record<string, PotData> = {}
  for (const [id, pot] of store.state.pots) {
    record[id] = {
      id: pot.id,
      row: pot.row,
      col: pot.col,
      currentMoisture: pot.currentMoisture,
      status: pot.status,
    }
  }
  return record
})

const sprayingPotIds = computed(() => {
  const ids: string[] = []
  for (const pot of store.state.pots.values()) {
    if (pot.status === 'spraying') ids.push(pot.id)
  }
  return ids
})

function handlePotClicked(potId: string) {
  store.state.selectedPotId = potId
  store.fetchPotDetail(potId)
  store.fetchHistory(potId)
}

function handlePotHovered(_potId: string | null) {}

function handleSpray(potId: string) {
  store.triggerSpray(potId)
}

function handleStop(potId: string) {
  store.stopSpray(potId)
}

function handleWSMessage(msg: WSMessage) {
  if (msg.type === 'moisture_update' && Array.isArray(msg.data)) {
    for (const item of msg.data as { id: string; moisture: number; status: string }[]) {
      store.updatePotFromWS(item.id, item.moisture, item.status)
    }
  } else if (msg.type === 'spray_status' && msg.data) {
    const data = msg.data as { potId: string; status: string; action: string }
    store.setSprayStatus(data.potId, data.status, data.action)
    if (store.state.selectedPotId === data.potId) {
      store.fetchPotDetail(data.potId)
      store.fetchHistory(data.potId)
    }
  } else if (msg.type === 'alert' && msg.data) {
    store.fetchAlerts()
  }
}

onMounted(() => {
  store.fetchPots()
  ws.onMessage(handleWSMessage)
  ws.connect()
})
</script>

<template>
  <div class="h-screen flex flex-col bg-[#0A1F1A] text-[#E0E0E0] overflow-hidden">
    <StatsBar
      :total="store.totalCount.value"
      :normal="store.normalCount.value"
      :warning="store.warningCount.value"
      :spraying="store.sprayingCount.value"
    />
    <div class="flex-1 flex min-h-0">
      <div class="flex-[7] relative">
        <Scene3D
          :pots="potsRecord"
          :spraying-pot-ids="sprayingPotIds"
          @pot-clicked="handlePotClicked"
          @pot-hovered="handlePotHovered"
        />
        <div class="absolute top-3 left-3 flex items-center gap-2">
          <span
            class="w-2.5 h-2.5 rounded-full"
            :class="ws.connected.value ? 'bg-[#00C853] animate-pulse' : 'bg-[#FFB300]'"
          />
          <span class="text-xs text-[#9E9E9E]">
            {{ ws.connected.value ? 'WebSocket 已连接' : 'WebSocket 断开' }}
          </span>
        </div>
      </div>
      <div class="flex-[3] min-w-[300px]">
        <InfoPanel
          :pot="store.selectedPot.value"
          :history="store.state.history"
          @spray="handleSpray"
          @stop="handleStop"
        />
      </div>
    </div>
  </div>
</template>
