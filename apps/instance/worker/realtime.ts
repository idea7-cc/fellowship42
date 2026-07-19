import { DurableObject } from 'cloudflare:workers'

export interface ChurchChangeEvent {
  churchId: string
  entity: string
  entityId: string
  action: 'created' | 'updated' | 'deleted'
  occurredAt: number
}

export class ChurchRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ connectedAt: Date.now() })

    return new Response(null, { status: 101, webSocket: client })
  }

  broadcast(event: ChurchChangeEvent): number {
    const message = JSON.stringify({ type: 'church.changed', ...event })
    let delivered = 0

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message)
        delivered += 1
      } catch {
        socket.close(1011, 'broadcast failed')
      }
    }

    return delivered
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string' && message === 'ping') {
      socket.send('pong')
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason)
  }
}
