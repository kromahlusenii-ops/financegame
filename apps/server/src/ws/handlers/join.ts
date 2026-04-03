import type WebSocket from 'ws';
import type { JoinSessionMessage } from '@financegame/shared';
import { SessionManager } from '../session.js';
import {
  sendToWs,
  broadcastToSession,
  sendToInstructor,
  getConnectionInfo,
  type ConnectionInfo,
} from '../broadcast.js';

export function handleJoin(
  ws: WebSocket,
  connInfo: ConnectionInfo,
  message: JoinSessionMessage,
  sessionManager: SessionManager
): void {
  try {
    const session = sessionManager.getSessionByCode(message.joinCode);
    if (!session) {
      sendToWs(ws, { type: 'error', code: 'SESSION_NOT_FOUND', message: 'Invalid join code' });
      return;
    }

    if (session.status !== 'lobby') {
      sendToWs(ws, { type: 'error', code: 'INVALID_STATE', message: 'Game has already started' });
      return;
    }

    const player = sessionManager.joinPlayer(session.sessionId, message.displayName);

    connInfo.playerId = player.playerId;
    connInfo.sessionId = session.sessionId;
    connInfo.isInstructor = false;

    // Send joined confirmation to the new player
    const players = Array.from(session.players.values()).map(p => ({
      id: p.playerId,
      name: p.displayName,
      status: p.status,
    }));

    sendToWs(ws, {
      type: 'joined',
      playerId: player.playerId,
      displayName: player.displayName,
      sessionStatus: session.status,
      players,
    });

    // Broadcast to all in session
    broadcastToSession(session.sessionId, {
      type: 'player_joined',
      playerId: player.playerId,
      displayName: player.displayName,
      playerCount: session.players.size,
    });

    // Send lobby update to instructor
    sendToInstructor(session.sessionId, {
      type: 'lobby_update',
      players: Array.from(session.players.values()).map(p => ({
        id: p.playerId,
        name: p.displayName,
      })),
      playerCount: session.players.size,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    sendToWs(ws, { type: 'error', code: errorMessage, message: errorMessage });
  }
}
