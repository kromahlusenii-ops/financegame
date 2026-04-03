import { SessionManager } from '../session.js';
import {
  broadcastToSession,
  sendToInstructor,
  type ConnectionInfo,
} from '../broadcast.js';

export function handleDisconnect(
  connInfo: ConnectionInfo,
  sessionManager: SessionManager
): void {
  if (!connInfo.sessionId) return;

  const session = sessionManager.getSession(connInfo.sessionId);
  if (!session) return;

  if (connInfo.isInstructor) {
    // Instructor disconnect — pause session
    broadcastToSession(connInfo.sessionId, {
      type: 'session_paused',
      reason: 'Instructor disconnected. Waiting for reconnection...',
    });
  } else if (connInfo.playerId) {
    sessionManager.disconnectPlayer(connInfo.sessionId, connInfo.playerId);

    broadcastToSession(connInfo.sessionId, {
      type: 'player_left',
      playerId: connInfo.playerId,
      playerCount: sessionManager.getActivePlayers(connInfo.sessionId).length,
    });

    sendToInstructor(connInfo.sessionId, {
      type: 'lobby_update',
      players: sessionManager.getActivePlayers(connInfo.sessionId).map(p => ({
        id: p.playerId,
        name: p.displayName,
      })),
      playerCount: sessionManager.getActivePlayers(connInfo.sessionId).length,
    });
  }
}
