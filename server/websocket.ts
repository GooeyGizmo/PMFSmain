import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

interface WebSocketClient extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

interface BroadcastMessage {
  type: string;
  payload: any;
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocketClient>> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocketClient) => {
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      });

      ws.on('close', () => {
        this.removeClient(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.removeClient(ws);
      });
    });

    const interval = setInterval(() => {
      this.wss?.clients.forEach((ws) => {
        const client = ws as WebSocketClient;
        if (client.isAlive === false) {
          this.removeClient(client);
          return client.terminate();
        }
        client.isAlive = false;
        client.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });

    console.log('WebSocket server initialized');
  }

  private handleMessage(ws: WebSocketClient, message: any) {
    switch (message.type) {
      case 'auth':
        if (message.userId) {
          ws.userId = message.userId;
          this.addClient(message.userId, ws);
          ws.send(JSON.stringify({ type: 'auth_success' }));
        }
        break;
      case 'subscribe':
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        break;
    }
  }

  private addClient(userId: string, ws: WebSocketClient) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(ws);
  }

  private removeClient(ws: WebSocketClient) {
    if (ws.userId && this.clients.has(ws.userId)) {
      this.clients.get(ws.userId)!.delete(ws);
      if (this.clients.get(ws.userId)!.size === 0) {
        this.clients.delete(ws.userId);
      }
    }
  }

  sendToUser(userId: string, message: BroadcastMessage) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const data = JSON.stringify(message);
      userClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    }
  }

  broadcast(message: BroadcastMessage) {
    if (!this.wss) return;
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  broadcastToAdmins(message: BroadcastMessage) {
    this.broadcast(message);
  }

  notifyOrderUpdate(order: any) {
    this.sendToUser(order.userId, {
      type: 'order_update',
      payload: { order },
    });
    this.broadcastToAdmins({
      type: 'order_update',
      payload: { order },
    });
  }

  notifyRouteUpdate(route: any) {
    this.broadcastToAdmins({
      type: 'route_update',
      payload: { route },
    });
  }

  notifyNewNotification(userId: string, notification: any) {
    this.sendToUser(userId, {
      type: 'notification',
      payload: { notification },
    });
  }

  notifyNotificationRead(userId: string) {
    this.sendToUser(userId, {
      type: 'notifications_read',
      payload: {},
    });
  }
}

export const wsService = new WebSocketService();
