type MessageListener = (message: any) => void;
type StatusListener = (connected: boolean, error: string) => void;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let disposed = false;
let currentConnected = false;
let currentError = '';

function url() {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function emitStatus(connected: boolean, error = '') {
  currentConnected = connected;
  currentError = error;
  statusListeners.forEach((listener) => listener(connected, error));
}

function connect() {
  if (typeof window === 'undefined' || socket || disposed || !messageListeners.size) return;
  socket = new WebSocket(url());
  socket.onopen = () => {
    reconnectAttempt = 0;
    emitStatus(true);
  };
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      messageListeners.forEach((listener) => listener(message));
    } catch {
      // Ignore malformed frames.
    }
  };
  socket.onerror = () => emitStatus(false, 'Live connection failed');
  socket.onclose = () => {
    socket = null;
    emitStatus(false, 'Reconnecting to live services…');
    if (disposed || !messageListeners.size) return;
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** Math.min(reconnectAttempt, 5)));
  };
}

export function subscribeRealtimeMessages(listener: MessageListener) {
  disposed = false;
  messageListeners.add(listener);
  connect();
  return () => {
    messageListeners.delete(listener);
    if (!messageListeners.size) {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      socket?.close();
      socket = null;
    }
  };
}

export function subscribeRealtimeStatus(listener: StatusListener) {
  statusListeners.add(listener);
  listener(currentConnected, currentError);
  return () => statusListeners.delete(listener);
}
