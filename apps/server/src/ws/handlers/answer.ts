import type WebSocket from 'ws';
import type { SubmitAnswerMessage } from '@financegame/shared';
import { SessionManager } from '../session.js';
import {
  sendToWs,
  sendToInstructor,
  type ConnectionInfo,
} from '../broadcast.js';

export function handleAnswer(
  ws: WebSocket,
  connInfo: ConnectionInfo,
  message: SubmitAnswerMessage,
  sessionManager: SessionManager
): void {
  try {
    if (!connInfo.sessionId || !connInfo.playerId) {
      sendToWs(ws, { type: 'error', code: 'NOT_IN_SESSION', message: 'You are not in a session' });
      return;
    }

    const result = sessionManager.submitAnswer(
      connInfo.sessionId,
      connInfo.playerId,
      message.selectedIndex
    );

    sendToWs(ws, {
      type: 'answer_result',
      ...result,
    });

    // Send live answer count to instructor
    const counts = sessionManager.getAnsweredCount(connInfo.sessionId);
    sendToInstructor(connInfo.sessionId, {
      type: 'checkpoint_answers_live',
      answeredCount: counts.answeredCount,
      totalAlive: counts.totalAlive,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    sendToWs(ws, { type: 'error', code: errorMessage, message: errorMessage });
  }
}
