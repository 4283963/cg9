<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface PotData {
  id: string
  row: number
  col: number
  currentMoisture: number
  status: 'normal' | 'warning' | 'spraying'
}

const props = defineProps<{
  pots: Record<string, PotData>
  sprayingPotIds: string[]
}>()

const emit = defineEmits<{
  'pot-clicked': [potId: string]
  'pot-hovered': [potId: string | null]
}>()

const containerRef = ref<HTMLDivElement | null>(null)

const COLOR_NORMAL = new THREE.Color(0x00c853)
const COLOR_WARNING = new THREE.Color(0xffb300)
const COLOR_SPRAYING = new THREE.Color(0x1565c0)
const PLANT_NORMAL = new THREE.Color(0x2e7d32)
const SOIL_COLOR = new THREE.Color(0x3e2723)

const TOTAL_POTS = 48
const COLS = 6
const ROWS = 8

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animationId = 0
let raycaster: THREE.Raycaster
let mouse: THREE.Vector2
let clock: THREE.Clock

const potIndexMap = new Map<string, number>()
const indexPotMap: string[] = []
const currentColors: THREE.Color[] = []
const targetColors: THREE.Color[] = []
const plantEmissives: number[] = []

let potMesh: THREE.InstancedMesh
let soilMesh: THREE.InstancedMesh
let plantMesh: THREE.InstancedMesh

let hoveredIndex = -1
let sprayParticles: THREE.Points | null = null
let sprayVelocities: Float32Array | null = null
let sprayLifetimes: Float32Array | null = null
let sprayPotIndices: number[] = []
const MAX_SPRAY_PARTICLES = 800
const PARTICLES_PER_POT = 50

const dummy = new THREE.Object3D()

function getStatusColor(status: string): THREE.Color {
  switch (status) {
    case 'warning': return COLOR_WARNING
    case 'spraying': return COLOR_SPRAYING
    default: return COLOR_NORMAL
  }
}

function buildIndexMaps() {
  let idx = 0
  for (let row = 1; row <= ROWS; row++) {
    for (let col = 1; col <= COLS; col++) {
      const id = `R${row}C${col}`
      potIndexMap.set(id, idx)
      indexPotMap[idx] = id
      currentColors[idx] = COLOR_NORMAL.clone()
      targetColors[idx] = COLOR_NORMAL.clone()
      plantEmissives[idx] = 0
      idx++
    }
  }
}

function createInstancedMeshes() {
  const potGeom = new THREE.CylinderGeometry(0.25, 0.2, 0.35, 16)
  const potMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    metalness: 0.2,
  })
  potMesh = new THREE.InstancedMesh(potGeom, potMat, TOTAL_POTS)
  potMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  potMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL_POTS * 3), 3)
  potMesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
  potMesh.userData.isPot = true

  const soilGeom = new THREE.CylinderGeometry(0.23, 0.23, 0.05, 16)
  const soilMat = new THREE.MeshStandardMaterial({
    color: SOIL_COLOR,
    roughness: 0.95,
  })
  soilMesh = new THREE.InstancedMesh(soilGeom, soilMat, TOTAL_POTS)
  soilMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  soilMesh.userData.isSoil = true

  const plantGeom = new THREE.SphereGeometry(0.15, 12, 8)
  const plantMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.7,
    emissive: 0x000000,
    emissiveIntensity: 0,
  })
  plantMesh = new THREE.InstancedMesh(plantGeom, plantMat, TOTAL_POTS)
  plantMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  plantMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL_POTS * 3), 3)
  plantMesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
  plantMesh.userData.isPlant = true

  for (let idx = 0; idx < TOTAL_POTS; idx++) {
    const id = indexPotMap[idx]
    const potData = props.pots[id]
    const row = potData?.row ?? Math.floor(idx / COLS) + 1
    const col = potData?.col ?? (idx % COLS) + 1

    const x = (col - 3.5) * 1.8
    const y = (row - 4.5) * 1.4
    const z = 0.2

    dummy.position.set(x, y, z)
    dummy.rotation.x = -0.15
    dummy.rotation.y = 0
    dummy.rotation.z = 0
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    potMesh.setMatrixAt(idx, dummy.matrix)
    soilMesh.setMatrixAt(idx, dummy.matrix)

    dummy.position.set(x, y + 0.35, z)
    dummy.rotation.x = -0.15
    dummy.updateMatrix()
    plantMesh.setMatrixAt(idx, dummy.matrix)

    const color = COLOR_NORMAL.clone()
    potMesh.setColorAt(idx, color)
    plantMesh.setColorAt(idx, PLANT_NORMAL.clone())

    targetColors[idx] = getStatusColor(potData?.status ?? 'normal')
  }

  potMesh.instanceMatrix.needsUpdate = true
  soilMesh.instanceMatrix.needsUpdate = true
  plantMesh.instanceMatrix.needsUpdate = true
  if (potMesh.instanceColor) potMesh.instanceColor.needsUpdate = true
  if (plantMesh.instanceColor) plantMesh.instanceColor.needsUpdate = true

  scene.add(potMesh)
  scene.add(soilMesh)
  scene.add(plantMesh)
}

function createUnifiedSprayParticles() {
  const positions = new Float32Array(MAX_SPRAY_PARTICLES * 3)
  sprayVelocities = new Float32Array(MAX_SPRAY_PARTICLES * 3)
  sprayLifetimes = new Float32Array(MAX_SPRAY_PARTICLES)

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('aLife', new THREE.BufferAttribute(sprayLifetimes, 1))

  const mat = new THREE.PointsMaterial({
    color: 0x4fc3f7,
    size: 0.08,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
    depthWrite: false,
  })

  sprayParticles = new THREE.Points(geom, mat)
  sprayParticles.visible = false
  scene.add(sprayParticles)
}

function getPotWorldPos(index: number): THREE.Vector3 {
  const id = indexPotMap[index]
  const potData = props.pots[id]
  const row = potData?.row ?? Math.floor(index / COLS) + 1
  const col = potData?.col ?? (index % COLS) + 1
  const x = (col - 3.5) * 1.8
  const y = (row - 4.5) * 1.4
  return new THREE.Vector3(x, y + 0.5, 0.3)
}

function initSprayForPot(index: number) {
  if (!sprayParticles || !sprayVelocities || !sprayLifetimes) return
  if (sprayPotIndices.includes(index)) return
  if (sprayPotIndices.length * PARTICLES_PER_POT >= MAX_SPRAY_PARTICLES) return

  sprayPotIndices.push(index)
  const baseIdx = (sprayPotIndices.length - 1) * PARTICLES_PER_POT
  const pos = getPotWorldPos(index)
  const positions = sprayParticles.geometry.attributes.position.array as Float32Array

  for (let i = 0; i < PARTICLES_PER_POT; i++) {
    const pi = baseIdx + i
    positions[pi * 3] = pos.x + (Math.random() - 0.5) * 0.1
    positions[pi * 3 + 1] = pos.y + Math.random() * 0.3
    positions[pi * 3 + 2] = pos.z + Math.random() * 0.1
    sprayVelocities[pi * 3] = (Math.random() - 0.5) * 0.3
    sprayVelocities[pi * 3 + 1] = -0.5 - Math.random() * 0.8
    sprayVelocities[pi * 3 + 2] = Math.random() * 0.2
    sprayLifetimes[pi] = 1
  }

  if (sprayParticles) sprayParticles.visible = true
  ;(sprayParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
}

function removeSprayForPot(index: number) {
  const posIdx = sprayPotIndices.indexOf(index)
  if (posIdx === -1 || !sprayParticles || !sprayVelocities || !sprayLifetimes) return

  const lastIdx = sprayPotIndices.length - 1
  const positions = sprayParticles.geometry.attributes.position.array as Float32Array

  if (posIdx !== lastIdx) {
    const fromBase = lastIdx * PARTICLES_PER_POT
    const toBase = posIdx * PARTICLES_PER_POT
    for (let i = 0; i < PARTICLES_PER_POT; i++) {
      positions[(toBase + i) * 3] = positions[(fromBase + i) * 3]
      positions[(toBase + i) * 3 + 1] = positions[(fromBase + i) * 3 + 1]
      positions[(toBase + i) * 3 + 2] = positions[(fromBase + i) * 3 + 2]
      sprayVelocities[(toBase + i) * 3] = sprayVelocities[(fromBase + i) * 3]
      sprayVelocities[(toBase + i) * 3 + 1] = sprayVelocities[(fromBase + i) * 3 + 1]
      sprayVelocities[(toBase + i) * 3 + 2] = sprayVelocities[(fromBase + i) * 3 + 2]
      sprayLifetimes[toBase + i] = sprayLifetimes[fromBase + i]
    }
    sprayPotIndices[posIdx] = sprayPotIndices[lastIdx]
  }

  sprayPotIndices.pop()
  ;(sprayParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true

  if (sprayPotIndices.length === 0) {
    sprayParticles.visible = false
  }
}

function updateSprayParticles(delta: number) {
  if (!sprayParticles || !sprayVelocities || !sprayLifetimes || sprayPotIndices.length === 0) return

  const positions = sprayParticles.geometry.attributes.position.array as Float32Array
  const posAttr = sprayParticles.geometry.attributes.position as THREE.BufferAttribute
  const totalParticles = sprayPotIndices.length * PARTICLES_PER_POT

  for (let p = 0; p < sprayPotIndices.length; p++) {
    const potIndex = sprayPotIndices[p]
    const potPos = getPotWorldPos(potIndex)
    const isActive = props.sprayingPotIds.includes(indexPotMap[potIndex])
    const baseIdx = p * PARTICLES_PER_POT

    for (let i = 0; i < PARTICLES_PER_POT; i++) {
      const idx = baseIdx + i
      positions[idx * 3] += sprayVelocities[idx * 3] * delta
      positions[idx * 3 + 1] += sprayVelocities[idx * 3 + 1] * delta
      positions[idx * 3 + 2] += sprayVelocities[idx * 3 + 2] * delta

      if (!isActive) {
        sprayLifetimes[idx] = Math.max(0, sprayLifetimes[idx] - delta * 2)
      }

      if (positions[idx * 3 + 1] < potPos.y - 0.5 || sprayLifetimes[idx] <= 0) {
        if (isActive) {
          positions[idx * 3] = potPos.x + (Math.random() - 0.5) * 0.1
          positions[idx * 3 + 1] = potPos.y + Math.random() * 0.3
          positions[idx * 3 + 2] = potPos.z + Math.random() * 0.1
          sprayVelocities[idx * 3] = (Math.random() - 0.5) * 0.3
          sprayVelocities[idx * 3 + 1] = -0.5 - Math.random() * 0.8
          sprayVelocities[idx * 3 + 2] = Math.random() * 0.2
          sprayLifetimes[idx] = 1
        }
      }
    }
  }

  const mat = sprayParticles.material as THREE.PointsMaterial
  const hasActive = props.sprayingPotIds.some(id => {
    const idx = potIndexMap.get(id)
    return idx !== undefined && sprayPotIndices.includes(idx)
  })
  mat.opacity = hasActive ? 0.8 : 0.4

  posAttr.needsUpdate = true
}

function syncSprayEffects() {
  const activeSet = new Set(props.sprayingPotIds)

  for (const potId of props.sprayingPotIds) {
    const idx = potIndexMap.get(potId)
    if (idx !== undefined && !sprayPotIndices.includes(idx)) {
      initSprayForPot(idx)
    }
  }

  const toRemove: number[] = []
  for (const idx of sprayPotIndices) {
    const id = indexPotMap[idx]
    if (!activeSet.has(id)) {
      toRemove.push(idx)
    }
  }
  for (const idx of toRemove) {
    removeSprayForPot(idx)
  }
}

function updatePotColors(time: number) {
  if (!potMesh.instanceColor || !plantMesh.instanceColor) return

  const potColors = potMesh.instanceColor.array as Float32Array
  const plantColors = plantMesh.instanceColor.array as Float32Array

  let needsUpdate = false

  for (let idx = 0; idx < TOTAL_POTS; idx++) {
    const id = indexPotMap[idx]
    const potData = props.pots[id]
    if (!potData) continue

    targetColors[idx] = getStatusColor(potData.status)

    const cur = currentColors[idx]
    const tgt = targetColors[idx]
    if (!cur.equals(tgt)) {
      cur.lerp(tgt, 0.15)
      potColors[idx * 3] = cur.r
      potColors[idx * 3 + 1] = cur.g
      potColors[idx * 3 + 2] = cur.b
      needsUpdate = true
    }

    let emissiveStrength = 0
    if (potData.status === 'warning') {
      emissiveStrength = ((Math.sin(time * 3 + idx * 0.3) + 1) / 2) * 0.6
    } else if (potData.status === 'spraying') {
      emissiveStrength = 0.3
    }

    if (idx === hoveredIndex) {
      emissiveStrength = Math.max(emissiveStrength, 0.25)
    }

    if (Math.abs(plantEmissives[idx] - emissiveStrength) > 0.001) {
      plantEmissives[idx] = emissiveStrength
      const r = PLANT_NORMAL.r * (1 - emissiveStrength) + (potData.status === 'warning' ? COLOR_WARNING.r : potData.status === 'spraying' ? COLOR_SPRAYING.r : 1) * emissiveStrength
      const g = PLANT_NORMAL.g * (1 - emissiveStrength) + (potData.status === 'warning' ? COLOR_WARNING.g : potData.status === 'spraying' ? COLOR_SPRAYING.g : 1) * emissiveStrength
      const b = PLANT_NORMAL.b * (1 - emissiveStrength) + (potData.status === 'warning' ? COLOR_WARNING.b : potData.status === 'spraying' ? COLOR_SPRAYING.b : 1) * emissiveStrength
      plantColors[idx * 3] = r
      plantColors[idx * 3 + 1] = g
      plantColors[idx * 3 + 2] = b
      needsUpdate = true
    }
  }

  if (needsUpdate) {
    potMesh.instanceColor.needsUpdate = true
    plantMesh.instanceColor.needsUpdate = true
  }
}

function onMouseMove(event: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObject(potMesh, false)

  let foundIdx = -1
  if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
    foundIdx = intersects[0].instanceId
  }

  if (foundIdx !== hoveredIndex) {
    hoveredIndex = foundIdx
    const potId = foundIdx >= 0 ? indexPotMap[foundIdx] : null
    emit('pot-hovered', potId)
  }
}

function onClick(_event: MouseEvent) {
  if (!containerRef.value) return

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObject(potMesh, false)

  if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
    const potId = indexPotMap[intersects[0].instanceId]
    emit('pot-clicked', potId)
  }
}

function onResize() {
  if (!containerRef.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

function animate() {
  animationId = requestAnimationFrame(animate)
  const delta = clock.getDelta()
  const time = clock.getElapsedTime()

  controls.update()
  updatePotColors(time)
  syncSprayEffects()
  updateSprayParticles(delta)
  renderer.render(scene, camera)
}

function initScene() {
  if (!containerRef.value) return

  buildIndexMaps()

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1f1a)

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(0, 0, 12)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  renderer.setSize(w, h)
  containerRef.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 4
  controls.maxDistance = 25
  controls.maxPolarAngle = Math.PI * 0.85
  controls.minPolarAngle = Math.PI * 0.15

  const ambient = new THREE.AmbientLight(0xfff8e1, 0.4)
  scene.add(ambient)

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(-5, 8, 5)
  scene.add(dirLight)

  const wallGeom = new THREE.PlaneGeometry(12, 16)
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a2f2a,
    roughness: 0.9,
    metalness: 0.05,
  })
  const wall = new THREE.Mesh(wallGeom, wallMat)
  wall.position.z = -0.1
  scene.add(wall)

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()
  clock = new THREE.Clock()

  createInstancedMeshes()
  createUnifiedSprayParticles()

  containerRef.value.addEventListener('mousemove', onMouseMove)
  containerRef.value.addEventListener('click', onClick)
  window.addEventListener('resize', onResize)

  animate()
}

watch(() => props.sprayingPotIds, () => {
  syncSprayEffects()
}, { deep: true })

onMounted(() => {
  initScene()
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  if (containerRef.value) {
    containerRef.value.removeEventListener('mousemove', onMouseMove)
    containerRef.value.removeEventListener('click', onClick)
  }
  window.removeEventListener('resize', onResize)

  potMesh?.geometry.dispose()
  ;(potMesh?.material as THREE.Material).dispose()
  soilMesh?.geometry.dispose()
  ;(soilMesh?.material as THREE.Material).dispose()
  plantMesh?.geometry.dispose()
  ;(plantMesh?.material as THREE.Material).dispose()
  sprayParticles?.geometry.dispose()
  ;(sprayParticles?.material as THREE.Material).dispose()

  renderer?.dispose()
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full" />
</template>
