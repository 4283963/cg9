import { WebSocket, WebSocketServer } from 'ws'

class WSService {
  private wss: WebSocketServer | null = null
  private clients: Set<WebSocket> = new Set()

  setup(wss: WebSocketServer) {
    this.wss = wss
    wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws)
      ws.on('close', () => {
        this.clients.delete(ws)
      })
      ws.on('error', () => {
        this.clients.delete(ws)
      })
    })
  }

  broadcast(message: { type: string; data?: unknown }) {
    const payload = JSON.stringify(message)
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
      }
    }
  }

  getClients(): Set<WebSocket> {
    return this.clients
  }
}

const wsService = new WSService()
export default wsService
