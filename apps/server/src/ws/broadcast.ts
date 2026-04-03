import type WebSocket from 'ws';
import type { ServerMessage } from '@financegame/shared';

export interface ConnectionInfo {
  ws: WebSocket;
  playerId: string | null;
  sessionId: string | null;
  isInstructor: boolean;
}

const connections = new Map<WebSocket, ConnectionInfo>();

export function registerConnection(ws: WebSocket): ConnectionInfo {
  const info: ConnectionInfo = {
    ws,
    playerId: null,
    sessionId: null,
    isInstructor: false,
  };
  connections.set(ws, info);
  return info;
}

export function removeConnection(ws: WebSocket): ConnectionInfo | undefined {
  const info = connections.get(ws);
  connections.delete(ws);
  return info;
}

export function getConnectionInfo(ws: WebSocket): ConnectionInfo | undefined {
  return connections.get(ws);
}

export function getConnectionByPlayerId(playerId: string): ConnectionInfo | undefined {
  for (const info of connections.values()) {
    if (info.playerId === playerId) return info;
  }
  return undefined;
}

export function getInstructorConnection(sessionId: string): ConnectionInfo | undefined {
  for (const info of connections.values()) {
    if (info.sessionId === sessionId && info.isInstructor) return info;
  }
  return undefined;
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function sendToPlayer(playerId: string, message: ServerMessage): void {
  const conn = getConnectionByPlayerId(playerId);
  if (conn) send(conn.ws, message);
}

export function sendToWs(ws: WebSocket, message: ServerMessage): void {
  send(ws, message);
}

export function sendToInstructor(sessionId: string, message: ServerMessage): void {
  const conn = getInstructorConnection(sessionId);
  if (conn) send(conn.ws, message);
}

export function broadcastToSession(sessionId: string, message: ServerMessage): void {
  for (const info of connections.values()) {
    if (info.sessionId === sessionId) {
      send(info.ws, message);
    }
  }
}

export function broadcastToPlayers(sessionId: string, message: ServerMessage): void {
  for (const info of connections.values()) {
    if (info.sessionId === sessionId && !info.isInstructor) {
      send(info.ws, message);
    }
  }
}
