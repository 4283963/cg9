import { ref, onUnmounted } from 'vue'

export interface WSMessage {
  type: string
  data?: unknown
}

type MessageHandler = (batch: WSMessage[]) => void

const connected = ref(false)
const lastMessage = ref<WSMessage | null>(null)

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let handlers: MessageHandler[] = []
let shouldReconnect = true

let messageQueue: WSMessage[] = []
let rafId: number | null = null
let flushPending = false

function flushQueue() {
  rafId = null
  flushPending = false

  if (messageQueue.length === 0) return

  const batch = messageQueue
  messageQueue = []

  for (const handler of handlers) {
    try {
      handler(batch)
    } catch {
    }
  }
}

function scheduleFlush() {
  if (flushPending) return
  flushPending = true
  rafId = requestAnimationFrame(flushQueue)
}

function connect(url?: string) {
  const wsUrl = url || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.hostname}:3001`
  disconnect()
  shouldReconnect = true

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    connected.value = true
  }

  ws.onclose = () => {
    connected.value = false
    if (shouldReconnect) {
      reconnectTimer = setTimeout(() => connect(url), 3000)
    }
  }

  ws.onerror = () => {
    ws?.close()
  }

  ws.onmessage = (event) => {
    try {
      const msg: WSMessage = JSON.parse(event.data)
      lastMessage.value = msg
      messageQueue.push(msg)
      scheduleFlush()
    } catch {
    }
  }
}

function disconnect() {
  shouldReconnect = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  flushPending = false
  messageQueue = []
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
  connected.value = false
}

function send(msg: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function onBatchMessage(handler: MessageHandler) {
  handlers.push(handler)
  return () => {
    handlers = handlers.filter((h) => h !== handler)
  }
}

export function useWebSocket() {
  onUnmounted(() => {
    disconnect()
  })

  return {
    connected,
    lastMessage,
    connect,
    disconnect,
    send,
    onBatchMessage,
  }
}
