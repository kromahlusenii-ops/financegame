import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { WebSocket } from 'ws';
import { createWebSocketServer } from '../src/ws/server.js';
import { SessionManager } from '../src/ws/session.js';
import {
  registerConnection,
  getConnectionInfo,
  type ConnectionInfo,
} from '../src/ws/broadcast.js';
import type { ServerMessage, CheckpointRow } from '@financegame/shared';

const PORT = 9876;

const sampleCheckpoints: CheckpointRow[] = [
  {
    id: 'cp-1', lesson_id: 'l-1', sort_order: 0,
    question: 'Q1?', options: ['A', 'B', 'C', 'D'],
    correct_index: 1, fact: 'Fact 1', created_at: new Date().toISOString(),
  },
  {
    id: 'cp-2', lesson_id: 'l-1', sort_order: 1,
    question: 'Q2?', options: ['A', 'B', 'C', 'D'],
    correct_index: 2, fact: 'Fact 2', created_at: new Date().toISOString(),
  },
];

function waitForMessage(ws: WebSocket, filter?: (msg: ServerMessage) => boolean): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for message')), 5000);
    const handler = (data: Buffer | string) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      if (!filter || filter(msg)) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

describe('WebSocket Integration', () => {
  let server: http.Server;
  let sessionManager: SessionManager;
  let clients: WebSocket[] = [];

  beforeEach(async () => {
    sessionManager = new SessionManager();
    server = http.createServer();
    createWebSocketServer(server, sessionManager);
    await new Promise<void>((resolve) => server.listen(PORT, resolve));
    clients = [];
  });

  afterEach(async () => {
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.close();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('completes full game lifecycle: join → launch → checkpoint → answer → resolve → end', async () => {
    // Create a session
    const session = sessionManager.createSession('instructor-1', 'lesson-1', 'session-1');
    const joinCode = session.joinCode;

    // Connect instructor WS (we simulate by setting connection info)
    const instructorWs = await connectClient(PORT);
    clients.push(instructorWs);

    // Manually register instructor connection
    const instructorConn = getConnectionInfo(instructorWs);
    if (instructorConn) {
      instructorConn.sessionId = 'session-1';
      instructorConn.isInstructor = true;
    }

    // Connect player 1
    const player1Ws = await connectClient(PORT);
    clients.push(player1Ws);

    // Player 1 joins
    const joinedPromise = waitForMessage(player1Ws, m => m.type === 'joined');
    player1Ws.send(JSON.stringify({
      type: 'join_session',
      joinCode,
      displayName: 'Alice',
    }));
    const joined = await joinedPromise;
    expect(joined.type).toBe('joined');
    if (joined.type !== 'joined') throw new Error('unexpected');
    expect(joined.displayName).toBe('Alice');
    const aliceId = joined.playerId;

    // Connect player 2
    const player2Ws = await connectClient(PORT);
    clients.push(player2Ws);

    const joined2Promise = waitForMessage(player2Ws, m => m.type === 'joined');
    player2Ws.send(JSON.stringify({
      type: 'join_session',
      joinCode,
      displayName: 'Bob',
    }));
    const joined2 = await joined2Promise;
    expect(joined2.type).toBe('joined');

    // Launch game
    sessionManager.launchGame('session-1', sampleCheckpoints);

    // Broadcast game_launched
    const { broadcastToSession } = await import('../src/ws/broadcast.js');
    broadcastToSession('session-1', {
      type: 'game_launched',
      totalCheckpoints: sampleCheckpoints.length,
    });

    const launchMsg = await waitForMessage(player1Ws, m => m.type === 'game_launched');
    expect(launchMsg.type).toBe('game_launched');

    // Fire checkpoint
    const checkpoint = sessionManager.fireCheckpoint('session-1', 15);
    broadcastToSession('session-1', {
      type: 'checkpoint_start',
      checkpointIndex: 0,
      question: checkpoint.question,
      options: checkpoint.options,
      timerSeconds: checkpoint.timerSeconds,
    });

    const cpMsg = await waitForMessage(player1Ws, m => m.type === 'checkpoint_start');
    expect(cpMsg.type).toBe('checkpoint_start');

    // Player 1 answers correctly
    const answerResultPromise = waitForMessage(player1Ws, m => m.type === 'answer_result');
    player1Ws.send(JSON.stringify({
      type: 'submit_answer',
      selectedIndex: 1,
    }));
    const answerResult = await answerResultPromise;
    expect(answerResult.type).toBe('answer_result');
    if (answerResult.type !== 'answer_result') throw new Error('unexpected');
    expect(answerResult.correct).toBe(true);
    expect(answerResult.livesRemaining).toBe(2);

    // Resolve checkpoint
    const resolution = sessionManager.resolveCheckpoint('session-1');
    broadcastToSession('session-1', {
      type: 'checkpoint_results',
      correctIndex: resolution.correctIndex,
      fact: resolution.fact,
      answerDistribution: resolution.answerDistribution,
      eliminations: resolution.eliminations,
      leaderboard: resolution.leaderboard,
    });

    const resultsMsg = await waitForMessage(player1Ws, m => m.type === 'checkpoint_results');
    expect(resultsMsg.type).toBe('checkpoint_results');

    // End session
    const leaderboard = sessionManager.endSession('session-1');
    broadcastToSession('session-1', {
      type: 'session_ended',
      finalLeaderboard: leaderboard,
    });

    const endMsg = await waitForMessage(player1Ws, m => m.type === 'session_ended');
    expect(endMsg.type).toBe('session_ended');
    if (endMsg.type !== 'session_ended') throw new Error('unexpected');
    expect(endMsg.finalLeaderboard.length).toBe(2);
  });

  it('validates incoming messages with Zod', async () => {
    const ws = await connectClient(PORT);
    clients.push(ws);

    const errorPromise = waitForMessage(ws, m => m.type === 'error');
    ws.send(JSON.stringify({ type: 'invalid_type', foo: 'bar' }));
    const errorMsg = await errorPromise;
    expect(errorMsg.type).toBe('error');
    if (errorMsg.type !== 'error') throw new Error('unexpected');
    expect(errorMsg.code).toBe('INVALID_MESSAGE');
  });

  it('responds to ping with pong', async () => {
    const ws = await connectClient(PORT);
    clients.push(ws);

    const pongPromise = waitForMessage(ws, m => m.type === 'pong');
    ws.send(JSON.stringify({ type: 'ping' }));
    const pong = await pongPromise;
    expect(pong.type).toBe('pong');
  });

  it('rejects join with invalid code', async () => {
    const ws = await connectClient(PORT);
    clients.push(ws);

    const errorPromise = waitForMessage(ws, m => m.type === 'error');
    ws.send(JSON.stringify({
      type: 'join_session',
      joinCode: 'XXXXXX',
      displayName: 'Test',
    }));
    const errorMsg = await errorPromise;
    expect(errorMsg.type).toBe('error');
    if (errorMsg.type !== 'error') throw new Error('unexpected');
    expect(errorMsg.code).toBe('SESSION_NOT_FOUND');
  });
});
