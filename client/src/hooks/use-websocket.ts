import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';

type MessageHandler = (message: any) => void;

interface UseWebSocketOptions {
  onMessage?: MessageHandler;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const [isConnected, setIsConnected] = useState(false);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'order_update':
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        queryClient.invalidateQueries({ queryKey: ['/api/ops/orders'] });
        queryClient.invalidateQueries({ queryKey: ['/api/ops/orders/detailed'] });
        break;
      case 'route_update':
        queryClient.invalidateQueries({ queryKey: ['/api/ops/routes'] });
        break;
      case 'notification':
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
        break;
      case 'notifications_read':
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
        break;
      default:
        break;
    }
  }, [queryClient]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    try {
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
        if (user?.id) {
          ws.send(JSON.stringify({ type: 'auth', userId: user.id }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
          options.onMessage?.(message);
        } catch (error) {
          // Silently ignore parse errors
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(3000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };

      ws.onerror = () => {
        // Silently handle errors - onclose will handle reconnection
      };

      wsRef.current = ws;
    } catch {
      // WebSocket creation failed, will retry on next attempt
    }
  }, [user?.id, options.onMessage, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    if (user) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [user, connect, disconnect]);

  useEffect(() => {
    if (user?.id && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'auth', userId: user.id }));
    }
  }, [user?.id]);

  return { isConnected, send, disconnect };
}
