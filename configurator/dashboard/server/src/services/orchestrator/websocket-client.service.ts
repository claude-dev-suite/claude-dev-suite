// SPDX-License-Identifier: MIT
/**
 * WebSocket Client Service
 *
 * Manages WebSocket client connections:
 * - Client connection tracking
 * - Client deduplication by clientId
 * - Message broadcasting
 * - Dead connection cleanup
 */

import type { WebSocket } from 'ws';
import { wsLogger } from '../../utils/logger.js';
import type { ClientState } from './types.js';

export class WebSocketClientService {
  private state: ClientState;

  constructor() {
    this.state = {
      clients: new Set(),
      clientMap: new Map(),
    };
  }

  /**
   * Add a client without clientId (legacy support)
   */
  addClient(ws: WebSocket): void {
    this.state.clients.add(ws);
    wsLogger.info('Client connected (no clientId)', { total: this.state.clients.size });
  }

  /**
   * Replace existing connection with same clientId to prevent duplicates
   */
  replaceClient(clientId: string, ws: WebSocket): void {
    // Close old connection if exists
    const oldWs = this.state.clientMap.get(clientId);
    if (oldWs && oldWs !== ws) {
      wsLogger.info('Replacing old connection for client', { clientId });
      this.state.clients.delete(oldWs);
      try {
        oldWs.close(4000, 'Replaced by new connection');
      } catch (e) {
        // Ignore close errors
      }
    }

    this.state.clientMap.set(clientId, ws);
    this.state.clients.add(ws);
    wsLogger.info('Client connected', { clientId, total: this.state.clients.size });
  }

  /**
   * Remove a client connection
   */
  removeClient(ws: WebSocket, clientId?: string): void {
    this.state.clients.delete(ws);
    if (clientId) {
      // Only remove from map if it's the same connection
      if (this.state.clientMap.get(clientId) === ws) {
        this.state.clientMap.delete(clientId);
      }
    }
    wsLogger.info('Client disconnected', { total: this.state.clients.size });
  }

  /**
   * Broadcast message to all connected clients, cleaning up dead connections
   */
  broadcast(message: Record<string, unknown>): void {
    const data = JSON.stringify(message);
    const deadClients: WebSocket[] = [];

    this.state.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(data);
        } catch (error) {
          wsLogger.error('Failed to send message to client', { error });
          deadClients.push(client);
        }
      } else if (client.readyState === 3) { // WebSocket.CLOSED
        deadClients.push(client);
      }
    });

    // Clean up dead connections
    deadClients.forEach((client) => this.state.clients.delete(client));
  }

  /**
   * Send message to a specific client
   */
  sendToClient(ws: WebSocket, message: Record<string, unknown>): void {
    if (ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        wsLogger.error('Failed to send message to client', { error });
        this.state.clients.delete(ws);
      }
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.state.clients.size;
  }

  /**
   * Get client state (for status reporting)
   */
  getState(): ClientState {
    return this.state;
  }
}
