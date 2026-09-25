export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface ServerMessage {
  messageType: number
  extentData?: unknown
  [key: string]: unknown
}

export interface RealtimeSocket {
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  send(data: string): void
  close(): void
}

export interface RealtimeHandlers {
  onStatus(status: RealtimeStatus): void
  onMessage(message: ServerMessage): void
  onError?(message: string): void
}

export interface RealtimeOptions {
  heartbeatIntervalMs?: number
  reconnectDelaysMs?: number[]
  location?: Pick<Location, 'protocol' | 'host'>
  createSocket?: (url: string) => RealtimeSocket
}

export function createWebSocketUrl(
  token: string,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`
}

export function createRealtimeClient(
  token: string,
  handlers: RealtimeHandlers,
  options: RealtimeOptions = {},
): { disconnect: () => void } {
  const reconnectDelays = options.reconnectDelaysMs ?? [1000, 2000, 5000, 10000, 15000, 30000]
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000
  const location = options.location ?? window.location
  const url = createWebSocketUrl(token, location)
  const socketFactory = options.createSocket ?? ((socketUrl: string) => new WebSocket(socketUrl))

  let stopped = false
  let retryCount = 0
  let socket: RealtimeSocket | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const clearHeartbeat = () => {
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) return
    const delay = reconnectDelays[retryCount]
    if (delay === undefined) {
      handlers.onStatus('offline')
      handlers.onError?.('实时连接暂时不可用，请刷新页面重试')
      return
    }
    retryCount += 1
    handlers.onStatus('reconnecting')
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      open()
    }, delay)
  }

  const open = () => {
    if (stopped) return
    handlers.onStatus(retryCount === 0 ? 'connecting' : 'reconnecting')
    let nextSocket: RealtimeSocket
    try {
      nextSocket = socketFactory(url)
    } catch {
      scheduleReconnect()
      return
    }
    socket = nextSocket

    nextSocket.onopen = () => {
      if (stopped || socket !== nextSocket) return
      retryCount = 0
      handlers.onStatus('connected')
      nextSocket.send('heart beat')
      clearHeartbeat()
      heartbeatTimer = setInterval(() => {
        if (!stopped && socket === nextSocket && nextSocket.readyState === 1) {
          nextSocket.send('heart beat')
        }
      }, heartbeatIntervalMs)
    }

    nextSocket.onmessage = (event) => {
      if (stopped || socket !== nextSocket) return
      try {
        handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage)
      } catch {
        handlers.onError?.('服务器返回了无法识别的实时消息')
      }
    }

    nextSocket.onclose = () => {
      clearHeartbeat()
      if (socket === nextSocket) socket = null
      scheduleReconnect()
    }

    nextSocket.onerror = () => {
      if (nextSocket.readyState !== 3) nextSocket.close()
    }
  }

  open()

  return {
    disconnect() {
      if (stopped) return
      stopped = true
      clearHeartbeat()
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      reconnectTimer = null
      const currentSocket = socket
      socket = null
      currentSocket?.close()
      handlers.onStatus('idle')
    },
  }
}
