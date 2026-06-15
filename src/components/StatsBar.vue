<script setup lang="ts">
import { ref, watch } from 'vue'
import { Flower2, CheckCircle, AlertTriangle, Droplets } from 'lucide-vue-next'

const props = defineProps<{
  total: number
  normal: number
  warning: number
  spraying: number
}>()

const displayTotal = ref(0)
const displayNormal = ref(0)
const displayWarning = ref(0)
const displaySpraying = ref(0)

function animateValue(current: Ref<number>, target: number) {
  const diff = target - current.value
  if (diff === 0) return
  const steps = 20
  const increment = diff / steps
  let step = 0
  const timer = setInterval(() => {
    step++
    if (step >= steps) {
      current.value = target
      clearInterval(timer)
    } else {
      current.value = Math.round(current.value + increment)
    }
  }, 20)
}

import type { Ref } from 'vue'

watch(() => props.total, (v) => animateValue(displayTotal, v), { immediate: true })
watch(() => props.normal, (v) => animateValue(displayNormal, v), { immediate: true })
watch(() => props.warning, (v) => animateValue(displayWarning, v), { immediate: true })
watch(() => props.spraying, (v) => animateValue(displaySpraying, v), { immediate: true })
</script>

<template>
  <div class="flex items-center gap-4 px-6 py-3 bg-[#0d2a22] border-b border-[#1a3f30]">
    <div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#37474F]/50">
      <Flower2 class="w-5 h-5 text-[#00C853]" />
      <div>
        <div class="text-xs text-[#9E9E9E]">总盆数</div>
        <div class="text-xl font-bold text-[#E0E0E0] font-orbitron">{{ displayTotal }}</div>
      </div>
    </div>
    <div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#37474F]/50">
      <CheckCircle class="w-5 h-5 text-[#00C853]" />
      <div>
        <div class="text-xs text-[#9E9E9E]">正常</div>
        <div class="text-xl font-bold text-[#00C853] font-orbitron">{{ displayNormal }}</div>
      </div>
    </div>
    <div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#37474F]/50">
      <AlertTriangle class="w-5 h-5 text-[#FFB300]" />
      <div>
        <div class="text-xs text-[#9E9E9E]">告警</div>
        <div class="text-xl font-bold text-[#FFB300] font-orbitron">{{ displayWarning }}</div>
      </div>
    </div>
    <div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#37474F]/50">
      <Droplets class="w-5 h-5 text-[#1565C0]" />
      <div>
        <div class="text-xs text-[#9E9E9E]">喷淋中</div>
        <div class="text-xl font-bold text-[#1565C0] font-orbitron">{{ displaySpraying }}</div>
      </div>
    </div>
    <div class="ml-auto flex items-center gap-2 text-xs text-[#9E9E9E]">
      <span class="w-2 h-2 rounded-full bg-[#00C853] animate-pulse" />
      实时监控中
    </div>
  </div>
</template>
