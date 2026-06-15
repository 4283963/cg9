import { ref, onUnmounted } from 'vue'

export interface WSMessage {
  type: string
  data?: unknown
}

type MessageHandler = (msg: WSMessage) => void

const connected = ref(false)
const lastMessage = ref<WSMessage | null>(null)

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let handlers: MessageHandler[] = []
let shouldReconnect = true

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
      for (const handler of handlers) {
        handler(msg)
      }
    } catch {}
  }
}

function disconnect() {
  shouldReconnect = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
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

function onMessage(handler: MessageHandler) {
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
    onMessage,
  }
}
