import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { ClientMessageSchema } from '@financegame/shared';
import { SessionManager } from './session.js';
import {
  registerConnection,
  removeConnection,
  getConnectionInfo,
  sendToWs,
  broadcastToSession,
  type ConnectionInfo,
} from './broadcast.js';
import { handleJoin } from './handlers/join.js';
import { handleAnswer } from './handlers/answer.js';
import { handleDisconnect } from './handlers/disconnect.js';

export function createWebSocketServer(
  server: Server,
  sessionManager: SessionManager
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const heartbeatInterval = Number(process.env.WS_HEARTBEAT_INTERVAL_MS) || 30000;

  // Heartbeat check
  const pingInterval = setInterval(() => {
    for (const ws of wss.clients) {
      const info = getConnectionInfo(ws);
      if (!info) continue;

      if ((ws as WebSocket & { isAlive?: boolean }).isAlive === false) {
        ws.terminate();
        continue;
      }

      (ws as WebSocket & { isAlive?: boolean }).isAlive = false;
      ws.ping();
    }
  }, heartbeatInterval);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  // Position broadcast at 10Hz
  const positionInterval = setInterval(() => {
    const sessionPositions = new Map<string, { playerId: string; positionX: number }[]>();

    for (const ws of wss.clients) {
      const info = getConnectionInfo(ws);
      if (!info?.sessionId || !info.playerId) continue;

      const session = sessionManager.getSession(info.sessionId);
      if (!session || session.status !== 'running') continue;

      const player = session.players.get(info.playerId);
      if (!player || player.status !== 'alive') continue;

      if (!sessionPositions.has(info.sessionId)) {
        sessionPositions.set(info.sessionId, []);
      }
      sessionPositions.get(info.sessionId)!.push({
        playerId: info.playerId,
        positionX: player.positionX,
      });
    }

    for (const [sessionId, positions] of sessionPositions) {
      broadcastToSession(sessionId, {
        type: 'player_positions',
        positions,
      });
    }
  }, 100);

  wss.on('close', () => {
    clearInterval(positionInterval);
  });

  wss.on('connection', (ws: WebSocket) => {
    const connInfo = registerConnection(ws);
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;

    ws.on('pong', () => {
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    });

    ws.on('message', (data: Buffer | string) => {
      try {
        const raw = JSON.parse(data.toString());
        const parseResult = ClientMessageSchema.safeParse(raw);

        if (!parseResult.success) {
          sendToWs(ws, {
            type: 'error',
            code: 'INVALID_MESSAGE',
            message: 'Invalid message format',
          });
          return;
        }

        const message = parseResult.data;

        switch (message.type) {
          case 'join_session':
            handleJoin(ws, connInfo, message, sessionManager);
            break;

          case 'submit_answer':
            handleAnswer(ws, connInfo, message, sessionManager);
            break;

          case 'player_position':
            if (connInfo.sessionId && connInfo.playerId) {
              const session = sessionManager.getSession(connInfo.sessionId);
              if (session && session.status === 'running') {
                const player = session.players.get(connInfo.playerId);
                if (player && player.status === 'alive') {
                  player.positionX = message.positionX;
                }
              }
            }
            break;

          case 'ping':
            sendToWs(ws, { type: 'pong' });
            if (connInfo.playerId && connInfo.sessionId) {
              const session = sessionManager.getSession(connInfo.sessionId);
              if (session) {
                const player = session.players.get(connInfo.playerId);
                if (player) player.lastPingMs = Date.now();
              }
            }
            break;
        }
      } catch (err) {
        sendToWs(ws, {
          type: 'error',
          code: 'PARSE_ERROR',
          message: 'Failed to parse message',
        });
      }
    });

    ws.on('close', () => {
      const info = removeConnection(ws);
      if (info) {
        handleDisconnect(info, sessionManager);
      }
    });
  });

  return wss;
}
