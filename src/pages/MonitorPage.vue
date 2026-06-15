<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import { usePotStore } from '@/composables/usePotStore'
import type { Pot } from '@/composables/usePotStore'

const store = usePotStore()

const activeTab = ref<'trend' | 'alerts' | 'logs' | 'config'>('trend')
const selectedPotForChart = ref<string>('')
const lowerBound = ref(40)
const upperBound = ref(70)

const trendChartRef = ref<HTMLDivElement | null>(null)
let trendChart: echarts.ECharts | null = null

const potList = ref<Pot[]>([])

watch(() => store.state.pots, () => {
  potList.value = Array.from(store.state.pots.values())
  if (!selectedPotForChart.value && potList.value.length > 0) {
    selectedPotForChart.value = potList.value[0].id
  }
}, { immediate: true })

watch(selectedPotForChart, async (id) => {
  if (id) {
    await store.fetchHistory(id)
    await nextTick()
    updateTrendChart()
  }
})

function updateTrendChart() {
  if (!trendChart || !store.state.history.length) return

  const history = store.state.history
  const times = history.map(r => {
    const d = new Date(r.timestamp)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  })
  const values = history.map(r => r.moisture)

  trendChart.setOption({
    tooltip: { trigger: 'axis', backgroundColor: '#1a2f2a', borderColor: '#2a4f3a', textStyle: { color: '#E0E0E0' } },
    grid: { top: 30, right: 20, bottom: 30, left: 50 },
    xAxis: {
      type: 'category',
      data: times,
      axisLabel: { color: '#9E9E9E', fontSize: 11, interval: Math.max(0, Math.floor(times.length / 6) - 1) },
      axisLine: { lineStyle: { color: '#37474F' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: '#9E9E9E', fontSize: 11 },
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
      symbol: 'circle',
      symbolSize: 4,
    }],
  })
}

watch(activeTab, async (tab) => {
  if (tab === 'trend') {
    await nextTick()
    if (trendChartRef.value && !trendChart) {
      trendChart = echarts.init(trendChartRef.value, 'dark')
    }
    updateTrendChart()
  } else if (tab === 'alerts') {
    store.fetchAlerts()
  } else if (tab === 'logs') {
    store.fetchLogs()
  } else if (tab === 'config') {
    store.fetchThresholds()
    lowerBound.value = store.state.thresholds.lowerBound
    upperBound.value = store.state.thresholds.upperBound
  }
})

async function saveThresholds() {
  await store.updateThresholds(lowerBound.value, upperBound.value)
}

onMounted(async () => {
  await store.fetchPots()
  await store.fetchThresholds()
  lowerBound.value = store.state.thresholds.lowerBound
  upperBound.value = store.state.thresholds.upperBound
  potList.value = Array.from(store.state.pots.values())
  if (potList.value.length > 0) {
    selectedPotForChart.value = potList.value[0].id
  }
})
</script>

<template>
  <div class="h-screen flex flex-col bg-[#0A1F1A] text-[#E0E0E0]">
    <div class="px-6 py-4 border-b border-[#1a3f30]">
      <h1 class="text-xl font-bold font-orbitron">数据监控</h1>
    </div>

    <div class="flex border-b border-[#1a3f30]">
      <button
        v-for="tab in ([
          { key: 'trend', label: '湿度趋势' },
          { key: 'alerts', label: '报警记录' },
          { key: 'logs', label: '操作日志' },
          { key: 'config', label: '阈值配置' },
        ] as const)"
        :key="tab.key"
        class="px-6 py-3 text-sm transition-colors"
        :class="activeTab === tab.key ? 'text-[#00C853] border-b-2 border-[#00C853]' : 'text-[#9E9E9E] hover:text-[#E0E0E0]'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
      <div v-if="activeTab === 'trend'">
        <div class="mb-4 flex items-center gap-3">
          <label class="text-sm text-[#9E9E9E]">选择花盆:</label>
          <select
            v-model="selectedPotForChart"
            class="bg-[#37474F] text-[#E0E0E0] px-3 py-1.5 rounded-lg border border-[#1a3f30] text-sm outline-none focus:border-[#00C853]"
          >
            <option v-for="pot in potList" :key="pot.id" :value="pot.id">
              {{ pot.id }} ({{ pot.currentMoisture }}%)
            </option>
          </select>
        </div>
        <div ref="trendChartRef" class="w-full h-[400px] bg-[#0d2a22] rounded-xl border border-[#1a3f30]" />
      </div>

      <div v-if="activeTab === 'alerts'">
        <div class="bg-[#0d2a22] rounded-xl border border-[#1a3f30] overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[#1a3f30]">
                <th class="text-left px-4 py-3 text-[#9E9E9E] font-normal">时间</th>
                <th class="text-left px-4 py-3 text-[#9E9E9E] font-normal">花盆</th>
                <th class="text-left px-4 py-3 text-[#9E9E9E] font-normal">类型</th>
                <th class="text-left px-4 py-3 text-[#9E9E9E] font-normal">消息</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="alert in store.state.alerts"
                :key="alert.id"
                class="border-b border-[#1a3f30]/50 hover:bg-[#1a3f30]/30"
              >
                <td class="px-4 py-2.5 text-[#9E9E9E]">{{ new Date(alert.timestamp).toLocaleString() }}</td>
                <td class="px-4 py-2.5 font-orbitron text-xs">{{ alert.potId }}</td>
                <td class="px-4 py-2.5">
                  <span class="px-1.5 py-0.5 rounded text-xs" :class="alert.type === 'low_moisture' ? 'bg-[#FFB300]/20 text-[#FFB300]' : 'bg-[#1565C0]/20 text-[#1565C0]'">
                    {{ alert.type }}
                  </span>
                </td>
                <td class="px-4 py-2.5">{{ alert.message }}</td>
              </tr>
              <tr v-if="!store.state.alerts.length">
                <td colspan="4" class="px-4 py-8 text-center text-[#9E9E9E]">暂无报警记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="activeTab === 'logs'">
        <div class="bg-[#0d2a22] rounded-xl border border-[#1a3f30] overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[#1a3f30]">
                <th class="text-left px-4 py-3 text-[#9E9E9E] font-normal">时间</th>
                <th class="text-left px-4 py-3 text-[#9E9E9E] font-normal">花盆</th>
                <th class="text-left px-4 py-3 text-[#9E9E9E] font-normal">操作</th>
                <th class="text-left px-4 py-3 text-[#9E9E9E] font-normal">操作者</th>
                <th class="text-left px-4 py-3 text-[#9E9E9E] font-normal">详情</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="log in store.state.logs"
                :key="log.id"
                class="border-b border-[#1a3f30]/50 hover:bg-[#1a3f30]/30"
              >
                <td class="px-4 py-2.5 text-[#9E9E9E]">{{ new Date(log.timestamp).toLocaleString() }}</td>
                <td class="px-4 py-2.5 font-orbitron text-xs">{{ log.potId }}</td>
                <td class="px-4 py-2.5">{{ log.action }}</td>
                <td class="px-4 py-2.5">{{ log.operator }}</td>
                <td class="px-4 py-2.5 text-[#9E9E9E]">{{ log.details || '-' }}</td>
              </tr>
              <tr v-if="!store.state.logs.length">
                <td colspan="5" class="px-4 py-8 text-center text-[#9E9E9E]">暂无操作日志</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="activeTab === 'config'" class="max-w-md">
        <div class="bg-[#0d2a22] rounded-xl border border-[#1a3f30] p-6">
          <h3 class="text-sm text-[#9E9E9E] mb-6">全局湿度阈值配置</h3>

          <div class="mb-6">
            <label class="flex items-center justify-between mb-2">
              <span class="text-sm">下限阈值</span>
              <span class="text-[#FFB300] font-orbitron">{{ lowerBound }}%</span>
            </label>
            <input
              v-model.number="lowerBound"
              type="range"
              :min="0"
              :max="upperBound - 1"
              class="w-full accent-[#FFB300]"
            />
          </div>

          <div class="mb-6">
            <label class="flex items-center justify-between mb-2">
              <span class="text-sm">上限阈值</span>
              <span class="text-[#00C853] font-orbitron">{{ upperBound }}%</span>
            </label>
            <input
              v-model.number="upperBound"
              type="range"
              :min="lowerBound + 1"
              :max="100"
              class="w-full accent-[#00C853]"
            />
          </div>

          <button
            class="w-full py-2.5 rounded-lg bg-[#00C853] hover:bg-[#00E676] text-[#0A1F1A] font-bold text-sm transition-colors"
            @click="saveThresholds"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
