import { useEffect, useRef } from 'react';

export type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

export function useWebSocket(onMessage: (msg: WebSocketMessage) => void) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let pingInterval: any = null;
    let isUnmounted = false;

    const connect = () => {
      if (isUnmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ws`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[WebSocket] Conectado en tiempo real al servidor API');
          // Send periodic heartbeat every 20s to keep ngrok tunnel connection active
          if (pingInterval) clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              try { ws.send('ping'); } catch (_) {}
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          if (event.data === 'pong') return;
          try {
            const data = JSON.parse(event.data);
            if (data && onMessageRef.current) {
              onMessageRef.current(data);
            }
          } catch (err) {
            // Ignore non-json frames
          }
        };

        ws.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          if (!isUnmounted) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          if (ws) {
            try { ws.close(); } catch (_) {}
          }
        };
      } catch (e) {
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, []);
}

