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

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animationId = 0
let raycaster: THREE.Raycaster
let mouse: THREE.Vector2

const potGroups = new Map<string, THREE.Group>()
const potMaterials = new Map<string, THREE.MeshStandardMaterial>()
const plantMaterials = new Map<string, THREE.MeshStandardMaterial>()
const sprayEffects = new Map<string, {
  points: THREE.Points
  velocities: Float32Array
  lifetime: number
}>()

let hoveredPotId: string | null = null
let clock: THREE.Clock

function getStatusColor(status: string): THREE.Color {
  switch (status) {
    case 'warning': return COLOR_WARNING.clone()
    case 'spraying': return COLOR_SPRAYING.clone()
    default: return COLOR_NORMAL.clone()
  }
}

function createPotGroup(potId: string, row: number, col: number): THREE.Group {
  const group = new THREE.Group()

  const potMat = new THREE.MeshStandardMaterial({
    color: COLOR_NORMAL.clone(),
    roughness: 0.6,
    metalness: 0.2,
  })
  const potGeom = new THREE.CylinderGeometry(0.25, 0.2, 0.35, 16)
  const potMesh = new THREE.Mesh(potGeom, potMat)
  potMesh.userData.potId = potId
  group.add(potMesh)

  const soilGeom = new THREE.CylinderGeometry(0.23, 0.23, 0.05, 16)
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.95 })
  const soilMesh = new THREE.Mesh(soilGeom, soilMat)
  soilMesh.position.y = 0.18
  soilMesh.userData.potId = potId
  group.add(soilMesh)

  const plantMat = new THREE.MeshStandardMaterial({
    color: 0x2e7d32,
    roughness: 0.7,
    emissive: 0x000000,
  })
  const plantGeom = new THREE.SphereGeometry(0.15, 12, 8)
  const plantMesh = new THREE.Mesh(plantGeom, plantMat)
  plantMesh.position.y = 0.35
  plantMesh.userData.potId = potId
  group.add(plantMesh)

  const x = (col - 3.5) * 1.8
  const y = (row - 4.5) * 1.4
  group.position.set(x, y, 0.2)
  group.rotation.x = -0.15

  potMaterials.set(potId, potMat)
  plantMaterials.set(potId, plantMat)
  potGroups.set(potId, group)

  return group
}

function createSprayEffect(potId: string) {
  if (sprayEffects.has(potId)) return

  const group = potGroups.get(potId)
  if (!group) return

  const count = 80
  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)

  const worldPos = new THREE.Vector3()
  group.getWorldPosition(worldPos)
  const topY = worldPos.y + 0.5

  for (let i = 0; i < count; i++) {
    positions[i * 3] = worldPos.x + (Math.random() - 0.5) * 0.1
    positions[i * 3 + 1] = topY + Math.random() * 0.3
    positions[i * 3 + 2] = worldPos.z + 0.1 + Math.random() * 0.1

    velocities[i * 3] = (Math.random() - 0.5) * 0.3
    velocities[i * 3 + 1] = -0.5 - Math.random() * 0.8
    velocities[i * 3 + 2] = Math.random() * 0.2 + 0.1
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const mat = new THREE.PointsMaterial({
    color: 0x4fc3f7,
    size: 0.08,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
    depthWrite: false,
  })

  const points = new THREE.Points(geom, mat)
  scene.add(points)

  sprayEffects.set(potId, { points, velocities, lifetime: 0 })
}

function removeSprayEffect(potId: string) {
  const effect = sprayEffects.get(potId)
  if (!effect) return

  const mat = effect.points.material as THREE.PointsMaterial
  mat.opacity = 0
  scene.remove(effect.points)
  effect.points.geometry.dispose()
  mat.dispose()
  sprayEffects.delete(potId)
}

function updateSprayParticles(delta: number) {
  const toRemove: string[] = []

  for (const [potId, effect] of sprayEffects) {
    const mat = effect.points.material as THREE.PointsMaterial
    const isStillSpraying = props.sprayingPotIds.includes(potId)

    if (!isStillSpraying) {
      effect.lifetime += delta
      mat.opacity = Math.max(0, 0.8 - effect.lifetime * 2)
      if (mat.opacity <= 0) {
        toRemove.push(potId)
        continue
      }
    } else {
      effect.lifetime = 0
      mat.opacity = 0.8
    }

    const posAttr = effect.points.geometry.attributes.position as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    const group = potGroups.get(potId)
    const worldPos = new THREE.Vector3()
    if (group) group.getWorldPosition(worldPos)
    const topY = worldPos.y + 0.5

    for (let i = 0; i < posAttr.count; i++) {
      positions[i * 3] += effect.velocities[i * 3] * delta
      positions[i * 3 + 1] += effect.velocities[i * 3 + 1] * delta
      positions[i * 3 + 2] += effect.velocities[i * 3 + 2] * delta

      if (positions[i * 3 + 1] < worldPos.y - 0.5) {
        positions[i * 3] = worldPos.x + (Math.random() - 0.5) * 0.1
        positions[i * 3 + 1] = topY + Math.random() * 0.3
        positions[i * 3 + 2] = worldPos.z + 0.1 + Math.random() * 0.1
        effect.velocities[i * 3] = (Math.random() - 0.5) * 0.3
        effect.velocities[i * 3 + 1] = -0.5 - Math.random() * 0.8
        effect.velocities[i * 3 + 2] = Math.random() * 0.2 + 0.1
      }
    }
    posAttr.needsUpdate = true
  }

  for (const id of toRemove) {
    removeSprayEffect(id)
  }
}

function updatePotColors(time: number) {
  for (const [potId, potData] of Object.entries(props.pots)) {
    const mat = potMaterials.get(potId)
    const plantMat = plantMaterials.get(potId)
    if (!mat || !plantMat) continue

    const targetColor = getStatusColor(potData.status)
    mat.color.lerp(targetColor, 0.1)

    if (potData.status === 'warning') {
      const pulse = (Math.sin(time * 3) + 1) / 2
      plantMat.emissive.set(0xffb300)
      plantMat.emissiveIntensity = pulse * 0.6
    } else if (potData.status === 'spraying') {
      plantMat.emissive.set(0x1565c0)
      plantMat.emissiveIntensity = 0.3
    } else {
      plantMat.emissive.set(0x000000)
      plantMat.emissiveIntensity = 0
    }
  }
}

function syncSprayEffects() {
  const currentSpraying = new Set(props.sprayingPotIds)
  for (const potId of currentSpraying) {
    if (!sprayEffects.has(potId)) {
      createSprayEffect(potId)
    }
  }
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

function onMouseMove(event: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects(scene.children, true)

  let foundPotId: string | null = null
  for (const hit of intersects) {
    const obj = hit.object
    if (obj.userData.potId) {
      foundPotId = obj.userData.potId
      break
    }
  }

  if (foundPotId !== hoveredPotId) {
    if (hoveredPotId) {
      const prevMat = potMaterials.get(hoveredPotId)
      if (prevMat) prevMat.emissiveIntensity = 0
    }
    hoveredPotId = foundPotId
    if (hoveredPotId) {
      const mat = potMaterials.get(hoveredPotId)
      if (mat) {
        mat.emissive.set(0xffffff)
        mat.emissiveIntensity = 0.15
      }
    }
    emit('pot-hovered', hoveredPotId)
  }
}

function onClick(event: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects(scene.children, true)

  for (const hit of intersects) {
    if (hit.object.userData.potId) {
      emit('pot-clicked', hit.object.userData.potId)
      return
    }
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

function initScene() {
  if (!containerRef.value) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1f1a)

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(0, 0, 12)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
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

  for (let row = 1; row <= 8; row++) {
    for (let col = 1; col <= 6; col++) {
      const potId = `R${row}C${col}`
      const potGroup = createPotGroup(potId, row, col)
      scene.add(potGroup)
    }
  }

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
  renderer?.dispose()
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full" />
</template>
