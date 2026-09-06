/** Reconnect after transient loss and refresh queries to recover missed events. */
export function connectRealtime(url: string, invalidate: () => void) {
  let stopped = false
  let delay = 1_000
  let retry: ReturnType<typeof setTimeout> | undefined
  let socket: WebSocket
  const connect = () => {
    if (stopped) return
    const currentSocket = new WebSocket(url)
    socket = currentSocket
    socket.addEventListener('open', () => {
      if (stopped) return
      delay = 1_000
      invalidate()
    })
    socket.addEventListener('message', () => {
      if (!stopped) invalidate()
    })
    socket.addEventListener('error', () => currentSocket.close())
    socket.addEventListener('close', () => {
      if (stopped) return
      retry = setTimeout(connect, delay)
      delay = Math.min(delay * 2, 30_000)
    })
  }
  connect()
  return () => {
    stopped = true
    clearTimeout(retry)
    socket.close(1000, 'navigation')
  }
}
