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
  it('builds a same-origin ws or wss URL and encodes the short-lived ticket', () => {
    expect(createWebSocketUrl('a+b', { protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/ws?ticket=a%2Bb',
    )
    expect(createWebSocketUrl('ticket', { protocol: 'https:', host: 'wetalk.example' })).toBe(
      'wss://wetalk.example/ws?ticket=ticket',
    )
  })

  it('sends an immediate heartbeat, repeats it, and forwards parsed messages', async () => {
    vi.useFakeTimers()
    const socket = new FakeSocket()
    const handlers: RealtimeHandlers = {
      onStatus: vi.fn(),
      onMessage: vi.fn(),
    }
    const client = createRealtimeClient(handlers, {
      location,
      heartbeatIntervalMs: 5000,
      ticketProvider: async () => 'one-time-ticket',
      createSocket: () => socket,
    })
    await Promise.resolve()

    socket.open()
    expect(socket.sent).toEqual(['heart beat'])
    vi.advanceTimersByTime(5000)
    expect(socket.sent).toEqual(['heart beat', 'heart beat'])
    socket.receive({ messageType: 0, extentData: { applyCount: 2 } })
    expect(handlers.onMessage).toHaveBeenCalledWith({ messageType: 0, extentData: { applyCount: 2 } })

    client.disconnect()
    expect(handlers.onStatus).toHaveBeenLastCalledWith('idle')
  })

  it('reconnects with a fresh ticket after a close and stops after disconnect', async () => {
    vi.useFakeTimers()
    const sockets: FakeSocket[] = []
    const handlers: RealtimeHandlers = {
      onStatus: vi.fn(),
      onMessage: vi.fn(),
    }
    const ticketProvider = vi.fn().mockResolvedValue('one-time-ticket')
    const client = createRealtimeClient(handlers, {
      location,
      reconnectDelaysMs: [50],
      ticketProvider,
      createSocket: () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
    })
    await Promise.resolve()

    sockets[0]?.remoteClose()
    expect(handlers.onStatus).toHaveBeenLastCalledWith('reconnecting')
    vi.advanceTimersByTime(50)
    await Promise.resolve()
    expect(sockets).toHaveLength(2)
    expect(ticketProvider).toHaveBeenCalledTimes(2)

    client.disconnect()
    sockets[1]?.remoteClose()
    vi.runOnlyPendingTimers()
    expect(sockets).toHaveLength(2)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('idle')
  })
})
