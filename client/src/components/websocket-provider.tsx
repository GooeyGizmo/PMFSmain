import { useWebSocket } from '@/hooks/use-websocket';
import { useAuth } from '@/lib/auth';

function WebSocketConnection() {
  useWebSocket({
    onMessage: () => {},
  });
  return null;
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <>
      {user && <WebSocketConnection />}
      {children}
    </>
  );
}
