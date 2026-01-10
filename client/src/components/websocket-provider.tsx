import { useWebSocket } from '@/hooks/use-websocket';
import { useAuth } from '@/lib/auth';

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  useWebSocket({
    onMessage: (message) => {
    },
  });

  return <>{children}</>;
}
