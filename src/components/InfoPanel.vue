<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import type { Pot, MoistureReading } from '@/composables/usePotStore'

const props = defineProps<{
  pot: Pot | null
  history: MoistureReading[]
}>()

const emit = defineEmits<{
  spray: [potId: string]
  stop: [potId: string]
}>()

const chartRef = ref<HTMLDivElement | null>(null)
let chartInstance: echarts.ECharts | null = null

function statusBadgeClass(status: string) {
  switch (status) {
    case 'warning': return 'bg-[#FFB300]/20 text-[#FFB300] border-[#FFB300]/40'
    case 'spraying': return 'bg-[#1565C0]/20 text-[#1565C0] border-[#1565C0]/40'
    default: return 'bg-[#00C853]/20 text-[#00C853] border-[#00C853]/40'
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'warning': return '告警'
    case 'spraying': return '喷淋中'
    default: return '正常'
  }
}

function updateChart() {
  if (!chartInstance || !props.history.length) return

  const times = props.history.map(r => {
    const d = new Date(r.timestamp)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  })
  const values = props.history.map(r => r.moisture)

  chartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a2f2a',
      borderColor: '#2a4f3a',
      textStyle: { color: '#E0E0E0', fontSize: 12 },
    },
    grid: { top: 20, right: 15, bottom: 25, left: 40 },
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: { color: '#9E9E9E', fontSize: 10, interval: Math.max(0, Math.floor(times.length / 5) - 1) },
      axisLine: { lineStyle: { color: '#37474F' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: '#9E9E9E', fontSize: 10 },
      axisLine: { lineStyle: { color: '#37474F' } },
      splitLine: { lineStyle: { color: '#37474F40' } },
    },
    series: [{
      type: 'line',
      data: values,
      smooth: true,
      lineStyle: { color: '#00C853', width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(0,200,83,0.3)' },
          { offset: 1, color: 'rgba(0,200,83,0.02)' },
        ]),
      },
      itemStyle: { color: '#00C853' },
      symbol: 'none',
    }],
  })
}

watch(() => props.pot, async () => {
  await nextTick()
  updateChart()
})

watch(() => props.history, () => {
  updateChart()
}, { deep: true })

onMounted(async () => {
  await nextTick()
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value, 'dark')
    updateChart()
  }
})

onUnmounted(() => {
  chartInstance?.dispose()
})
</script>

<template>
  <div class="h-full flex flex-col bg-[#0d2a22] border-l border-[#1a3f30] overflow-y-auto custom-scrollbar">
    <div v-if="!pot" class="flex-1 flex items-center justify-center text-[#9E9E9E]">
      <div class="text-center">
        <div class="text-4xl mb-3 opacity-30">🪴</div>
        <div>点击3D场景中的花盆</div>
        <div class="text-sm mt-1">查看详细信息</div>
      </div>
    </div>

    <template v-else>
      <div class="px-5 py-4 border-b border-[#1a3f30]">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-[#E0E0E0] font-orbitron">{{ pot.id }}</h2>
          <span class="px-2 py-0.5 text-xs rounded border" :class="statusBadgeClass(pot.status)">
            {{ statusLabel(pot.status) }}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div class="text-[#9E9E9E]">位置</div>
            <div class="text-[#E0E0E0]">第{{ pot.row }}行 第{{ pot.col }}列</div>
          </div>
          <div>
            <div class="text-[#9E9E9E]">当前湿度</div>
            <div class="text-2xl font-bold font-orbitron" :class="pot.status === 'warning' ? 'text-[#FFB300]' : 'text-[#00C853]'">
              {{ pot.currentMoisture }}%
            </div>
          </div>
          <div>
            <div class="text-[#9E9E9E]">阈值范围</div>
            <div class="text-[#E0E0E0]">{{ pot.lowerThreshold }}% ~ {{ pot.upperThreshold }}%</div>
          </div>
          <div>
            <div class="text-[#9E9E9E]">喷淋次数</div>
            <div class="text-[#E0E0E0]">{{ pot.sprayCount }}</div>
          </div>
        </div>
      </div>

      <div class="px-5 py-4 border-b border-[#1a3f30]">
        <h3 class="text-sm text-[#9E9E9E] mb-2">湿度趋势</h3>
        <div ref="chartRef" class="w-full h-44" />
      </div>

      <div class="px-5 py-4 flex gap-3">
        <button
          class="flex-1 py-2.5 rounded-lg font-bold text-sm transition-all duration-200"
          :class="pot.status === 'spraying' ? 'bg-[#1565C0]/30 text-[#1565C0] cursor-not-allowed' : 'bg-[#1565C0] hover:bg-[#1976D2] text-white'"
          :disabled="pot.status === 'spraying'"
          @click="emit('spray', pot.id)"
        >
          开始喷淋
        </button>
        <button
          class="flex-1 py-2.5 rounded-lg font-bold text-sm transition-all duration-200"
          :class="pot.status !== 'spraying' ? 'bg-[#37474F]/50 text-[#9E9E9E] cursor-not-allowed' : 'bg-[#FFB300] hover:bg-[#FFC107] text-[#0A1F1A]'"
          :disabled="pot.status !== 'spraying'"
          @click="emit('stop', pot.id)"
        >
          停止喷淋
        </button>
      </div>
    </template>
  </div>
</template>
