import { useEffect, useRef, useState } from 'react';
import type { ClientCommand, ServerEvent, SessionState } from '@photobooth/shared';

export function useSession(operator: boolean) {
  const [state, setState] = useState<SessionState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  useEffect(() => {
    let disposed = false;
    let reconnect: ReturnType<typeof setTimeout>;
    let lastMessage = performance.now();
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=${operator ? 'operator' : 'display'}`);
      socket.current = ws;
      ws.onmessage = event => {
        lastMessage = performance.now();
        const message = JSON.parse(event.data) as ServerEvent;
        if (message.type === 'STATE') { setState(message.state); setConnected(true); }
        else { setPending(false); setError(message.ok ? '' : message.error ?? 'Command rejected'); }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setPending(false);
        reconnect = setTimeout(connect, 1000);
      };
    };
    connect();
    // Connection watchdog only: no client countdown or automatic command replay.
    const watchdog = setInterval(() => {
      if (performance.now() - lastMessage > 4000) { setConnected(false); socket.current?.close(); }
    }, 1000);
    return () => { disposed = true; clearTimeout(reconnect); clearInterval(watchdog); socket.current?.close(); };
  }, [operator]);
  const command = (type: ClientCommand['type']) => {
    if (!operator || !connected || pending || socket.current?.readyState !== WebSocket.OPEN) return;
    setPending(true);
    setError('');
    socket.current.send(JSON.stringify({ type, requestId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}` } satisfies ClientCommand));
  };
  return { state, connected, error, pending, command };
}
