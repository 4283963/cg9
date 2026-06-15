import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import app from './app.js'
import wsService from './services/WSService.js'
import sensorService from './services/SensorService.js'
import sprayService from './services/SprayService.js'

const PORT = process.env.PORT || 3001

const server = createServer(app)

const wss = new WebSocketServer({ server })

wsService.setup(wss)

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'spray_request' && msg.potId) {
        const duration = msg.duration ?? 3000
        sprayService.triggerSpray(msg.potId, duration, 'ws_client')
      } else if (msg.type === 'stop_spray' && msg.potId) {
        sprayService.stopSpray(msg.potId)
      }
    } catch {
      // ignore invalid messages
    }
  })
})

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
  sensorService.start()
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  sensorService.stop()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  sensorService.stop()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app
