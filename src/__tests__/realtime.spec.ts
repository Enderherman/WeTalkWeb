import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRealtimeClient,
  createWebSocketUrl,
  type RealtimeHandlers,
  type RealtimeSocket,
} from '@/api/realtime'

class FakeSocket implements RealtimeSocket {
  readyState = 0
  onopen: RealtimeSocket['onopen'] = null
  onmessage: RealtimeSocket['onmessage'] = null
  onclose: RealtimeSocket['onclose'] = null
  onerror: RealtimeSocket['onerror'] = null
  sent: string[] = []

  send(value: string) {
    this.sent.push(value)
  }

  close() {
    this.readyState = 3
    this.onclose?.(new Event('close') as CloseEvent)
  }

  open() {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  receive(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent)
  }

  remoteClose() {
    this.readyState = 3
    this.onclose?.(new Event('close') as CloseEvent)
  }
}

const location = { protocol: 'http:', host: '127.0.0.1:5173' }

afterEach(() => vi.useRealTimers())

describe('realtime websocket client', () => {
  it('builds a same-origin ws or wss URL and encodes the token', () => {
    expect(createWebSocketUrl('a+b', { protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/ws?token=a%2Bb',
    )
    expect(createWebSocketUrl('ticket', { protocol: 'https:', host: 'wetalk.example' })).toBe(
      'wss://wetalk.example/ws?token=ticket',
    )
  })

  it('sends an immediate heartbeat, repeats it, and forwards parsed messages', () => {
    vi.useFakeTimers()
    const socket = new FakeSocket()
    const handlers: RealtimeHandlers = {
      onStatus: vi.fn(),
      onMessage: vi.fn(),
    }
    const client = createRealtimeClient('token', handlers, {
      location,
      heartbeatIntervalMs: 5000,
      createSocket: () => socket,
    })

    socket.open()
    expect(socket.sent).toEqual(['heart beat'])
    vi.advanceTimersByTime(5000)
    expect(socket.sent).toEqual(['heart beat', 'heart beat'])
    socket.receive({ messageType: 0, extentData: { applyCount: 2 } })
    expect(handlers.onMessage).toHaveBeenCalledWith({ messageType: 0, extentData: { applyCount: 2 } })

    client.disconnect()
    expect(handlers.onStatus).toHaveBeenLastCalledWith('idle')
  })

  it('reconnects after a close and stops reconnecting after disconnect', () => {
    vi.useFakeTimers()
    const sockets: FakeSocket[] = []
    const handlers: RealtimeHandlers = {
      onStatus: vi.fn(),
      onMessage: vi.fn(),
    }
    const client = createRealtimeClient('token', handlers, {
      location,
      reconnectDelaysMs: [50],
      createSocket: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
    })

    sockets[0]?.remoteClose()
    expect(handlers.onStatus).toHaveBeenLastCalledWith('reconnecting')
    vi.advanceTimersByTime(50)
    expect(sockets).toHaveLength(2)

    client.disconnect()
    sockets[1]?.remoteClose()
    vi.runOnlyPendingTimers()
    expect(sockets).toHaveLength(2)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('idle')
  })
})
