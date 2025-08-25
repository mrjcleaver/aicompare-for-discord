import { API_ENDPOINTS, WEBSOCKET_EVENTS } from './constants';
import type { WebSocketMessage } from '@/types/comparison';

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectInterval: number = 1000;
  private maxReconnectInterval: number = 30000;
  private reconnectDecay: number = 1.5;
  private connectionTimeout: number = 4000;
  private timeoutId?: NodeJS.Timeout;
  private reconnectTimeoutId?: NodeJS.Timeout;
  private listeners: Map<string, Set<Function>> = new Map();
  private isManuallyDisconnected = false;

  constructor(
    private url: string = API_ENDPOINTS.WS_URL, 
    private authToken: string
  ) {}

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    this.isManuallyDisconnected = false;

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.url}?token=${encodeURIComponent(this.authToken)}`;
        this.ws = new WebSocket(wsUrl);
        
        this.timeoutId = setTimeout(() => {
          this.ws?.close();
          reject(new Error('Connection timeout'));
        }, this.connectionTimeout);

        this.ws.onopen = () => {
          clearTimeout(this.timeoutId);
          this.reconnectInterval = 1000; // Reset reconnect interval
          console.log('WebSocket connected');
          
          // Send ping to keep connection alive
          this.startHeartbeat();
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = (event) => {
          clearTimeout(this.timeoutId);
          this.stopHeartbeat();
          
          console.log('WebSocket disconnected:', event.code, event.reason);
          
          // Only auto-reconnect for abnormal closures and if not manually disconnected
          if (event.code !== 1000 && !this.isManuallyDisconnected) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(this.timeoutId);
          console.error('WebSocket error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private heartbeatInterval?: NodeJS.Timeout;

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Send ping every 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    this.reconnectTimeoutId = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect().catch(() => {
        // Increase reconnect interval with exponential backoff
        this.reconnectInterval = Math.min(
          this.reconnectInterval * this.reconnectDecay,
          this.maxReconnectInterval
        );
        this.scheduleReconnect();
      });
    }, this.reconnectInterval);
  }

  private handleMessage(message: WebSocketMessage) {
    const { type, data } = message;
    
    // Handle ping/pong
    if (type === 'ping') {
      this.send('pong', {});
      return;
    }
    
    if (type === 'pong') {
      return; // Just acknowledge
    }
    
    const listeners = this.listeners.get(type);
    
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error('Error in WebSocket message listener:', error);
        }
      });
    }
  }

  on(eventType: string, listener: Function) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  off(eventType: string, listener: Function) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  send(type: string, data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = { type, data };
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected. Message not sent:', { type, data });
    }
  }

  disconnect() {
    this.isManuallyDisconnected = true;
    
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = undefined;
    }
    
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getReadyState(): number | undefined {
    return this.ws?.readyState;
  }

  // Utility methods for common event types
  onComparisonUpdate(callback: (comparison: any) => void) {
    this.on(WEBSOCKET_EVENTS.COMPARISON_UPDATE, callback);
  }

  offComparisonUpdate(callback: (comparison: any) => void) {
    this.off(WEBSOCKET_EVENTS.COMPARISON_UPDATE, callback);
  }

  onVoteUpdate(callback: (voteData: any) => void) {
    this.on(WEBSOCKET_EVENTS.VOTE_UPDATE, callback);
  }

  offVoteUpdate(callback: (voteData: any) => void) {
    this.off(WEBSOCKET_EVENTS.VOTE_UPDATE, callback);
  }

  onNewComparison(callback: (comparison: any) => void) {
    this.on(WEBSOCKET_EVENTS.NEW_COMPARISON, callback);
  }

  offNewComparison(callback: (comparison: any) => void) {
    this.off(WEBSOCKET_EVENTS.NEW_COMPARISON, callback);
  }

  onModelRating(callback: (ratingData: any) => void) {
    this.on(WEBSOCKET_EVENTS.MODEL_RATING, callback);
  }

  offModelRating(callback: (ratingData: any) => void) {
    this.off(WEBSOCKET_EVENTS.MODEL_RATING, callback);
  }
}

// Singleton instance holder
let wsManager: WebSocketManager | null = null;

export function createWebSocketManager(authToken: string): WebSocketManager {
  if (wsManager) {
    wsManager.disconnect();
  }
  
  wsManager = new WebSocketManager(API_ENDPOINTS.WS_URL, authToken);
  return wsManager;
}

export function getWebSocketManager(): WebSocketManager | null {
  return wsManager;
}

export function disconnectWebSocket() {
  if (wsManager) {
    wsManager.disconnect();
    wsManager = null;
  }
}