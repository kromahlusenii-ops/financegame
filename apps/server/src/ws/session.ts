import { v4 as uuidv4 } from 'uuid';
import type {
  SessionState,
  SessionStatus,
  PlayerState,
  CheckpointState,
  AnswerRecord,
  LeaderboardEntry,
  CheckpointRow,
} from '@financegame/shared';
import { calculatePoints, sortLeaderboard } from '@financegame/shared';

const AMBIGUOUS_CHARS = new Set(['0', 'O', '1', 'I', 'L']);
const ALLOWED_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 50;

function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALLOWED_CHARS[Math.floor(Math.random() * ALLOWED_CHARS.length)];
  }
  return code;
}

export interface CheckpointResolution {
  correctIndex: number;
  fact: string;
  answerDistribution: Record<number, number>;
  eliminations: { playerId: string; displayName: string }[];
  leaderboard: LeaderboardEntry[];
  answerResults: Map<string, {
    correct: boolean;
    correctIndex: number;
    pointsAwarded: number;
    livesRemaining: number;
    newStatus: 'alive' | 'eliminated';
    fact: string;
  }>;
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();
  private joinCodeToSessionId = new Map<string, string>();

  createSession(instructorId: string, lessonId: string, sessionId: string): SessionState {
    let joinCode = generateJoinCode();
    let attempts = 0;
    while (this.joinCodeToSessionId.has(joinCode)) {
      joinCode = generateJoinCode();
      attempts++;
      if (attempts > 100) {
        throw new Error('Failed to generate unique join code');
      }
    }

    const session: SessionState = {
      sessionId,
      joinCode,
      lessonId,
      instructorId,
      status: 'lobby',
      players: new Map(),
      checkpoints: [],
      currentCheckpointIndex: -1,
      createdAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.joinCodeToSessionId.set(joinCode, sessionId);
    return session;
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByCode(joinCode: string): SessionState | undefined {
    const sessionId = this.joinCodeToSessionId.get(joinCode);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  joinPlayer(sessionId: string, displayName: string): PlayerState {
    const session = this.requireSession(sessionId);
    this.requireStatus(session, 'lobby');

    const alivePlayers = Array.from(session.players.values()).filter(
      p => p.status !== 'disconnected'
    );
    if (alivePlayers.length >= MAX_PLAYERS) {
      throw new Error('MAX_PLAYERS');
    }

    const finalName = this.resolveDisplayName(session, displayName);

    const player: PlayerState = {
      playerId: uuidv4(),
      displayName: finalName,
      score: 0,
      lives: 2,
      status: 'alive',
      answers: [],
      lastPingMs: Date.now(),
      positionX: 0,
    };

    session.players.set(player.playerId, player);
    return player;
  }

  launchGame(sessionId: string, checkpointRows: CheckpointRow[]): void {
    const session = this.requireSession(sessionId);
    this.requireStatus(session, 'lobby');

    if (session.players.size === 0) {
      throw new Error('NO_PLAYERS');
    }

    session.checkpoints = checkpointRows.map(row => ({
      checkpointId: row.id,
      question: row.question,
      options: row.options,
      correctIndex: row.correct_index,
      fact: row.fact,
      startedAt: 0,
      timerSeconds: 0,
      answersReceived: new Map(),
    }));

    session.status = 'running';
    session.currentCheckpointIndex = -1;
  }

  fireCheckpoint(sessionId: string, timerSeconds: number): CheckpointState {
    const session = this.requireSession(sessionId);
    this.requireStatus(session, 'running');

    const nextIndex = session.currentCheckpointIndex + 1;
    if (nextIndex >= session.checkpoints.length) {
      throw new Error('NO_MORE_CHECKPOINTS');
    }

    session.currentCheckpointIndex = nextIndex;
    const checkpoint = session.checkpoints[nextIndex];
    checkpoint.startedAt = Date.now();
    checkpoint.timerSeconds = timerSeconds;
    checkpoint.answersReceived = new Map();

    session.status = 'checkpoint_active';
    return checkpoint;
  }

  submitAnswer(sessionId: string, playerId: string, selectedIndex: number): {
    correct: boolean;
    correctIndex: number;
    pointsAwarded: number;
    livesRemaining: number;
    newStatus: 'alive' | 'eliminated';
    fact: string;
  } {
    const session = this.requireSession(sessionId);
    this.requireStatus(session, 'checkpoint_active');

    const player = session.players.get(playerId);
    if (!player) throw new Error('PLAYER_NOT_FOUND');
    if (player.status !== 'alive') throw new Error('PLAYER_NOT_ALIVE');

    const checkpoint = session.checkpoints[session.currentCheckpointIndex];
    if (checkpoint.answersReceived.has(playerId)) {
      throw new Error('ALREADY_ANSWERED');
    }

    const timeTakenMs = Date.now() - checkpoint.startedAt;
    const correct = selectedIndex === checkpoint.correctIndex;
    const pointsAwarded = calculatePoints(correct, timeTakenMs, checkpoint.timerSeconds);

    checkpoint.answersReceived.set(playerId, { selectedIndex, timeTakenMs });

    player.score += pointsAwarded;
    if (!correct) {
      player.lives -= 1;
    }

    const newStatus: 'alive' | 'eliminated' = player.lives <= 0 ? 'eliminated' : 'alive';
    player.status = newStatus;

    player.answers.push({
      checkpointId: checkpoint.checkpointId,
      selectedIndex,
      correct,
      timeTakenMs,
      pointsAwarded,
    });

    return {
      correct,
      correctIndex: checkpoint.correctIndex,
      pointsAwarded,
      livesRemaining: player.lives,
      newStatus,
      fact: correct ? '' : checkpoint.fact,
    };
  }

  resolveCheckpoint(sessionId: string): CheckpointResolution {
    const session = this.requireSession(sessionId);
    this.requireStatus(session, 'checkpoint_active');

    const checkpoint = session.checkpoints[session.currentCheckpointIndex];

    // Mark non-answerers as wrong
    const answerResults = new Map<string, {
      correct: boolean;
      correctIndex: number;
      pointsAwarded: number;
      livesRemaining: number;
      newStatus: 'alive' | 'eliminated';
      fact: string;
    }>();

    for (const [playerId, player] of session.players) {
      if (player.status === 'disconnected') continue;
      if (player.status === 'eliminated') continue;

      if (!checkpoint.answersReceived.has(playerId)) {
        // Didn't answer = wrong
        player.lives -= 1;
        const newStatus: 'alive' | 'eliminated' = player.lives <= 0 ? 'eliminated' : 'alive';
        player.status = newStatus;

        player.answers.push({
          checkpointId: checkpoint.checkpointId,
          selectedIndex: -1,
          correct: false,
          timeTakenMs: checkpoint.timerSeconds * 1000,
          pointsAwarded: 0,
        });

        checkpoint.answersReceived.set(playerId, {
          selectedIndex: -1,
          timeTakenMs: checkpoint.timerSeconds * 1000,
        });

        answerResults.set(playerId, {
          correct: false,
          correctIndex: checkpoint.correctIndex,
          pointsAwarded: 0,
          livesRemaining: player.lives,
          newStatus,
          fact: checkpoint.fact,
        });
      }
    }

    // Build answer distribution
    const distribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const { selectedIndex } of checkpoint.answersReceived.values()) {
      if (selectedIndex >= 0 && selectedIndex <= 3) {
        distribution[selectedIndex] = (distribution[selectedIndex] || 0) + 1;
      }
    }

    // Find eliminations
    const eliminations: { playerId: string; displayName: string }[] = [];
    for (const [playerId, player] of session.players) {
      if (player.status === 'eliminated' && player.lives === 0) {
        const lastAnswer = player.answers[player.answers.length - 1];
        if (lastAnswer && lastAnswer.checkpointId === checkpoint.checkpointId && !lastAnswer.correct) {
          eliminations.push({ playerId, displayName: player.displayName });
        }
      }
    }

    // Build leaderboard
    const leaderboard = this.buildLeaderboard(session);

    session.status = 'running';

    return {
      correctIndex: checkpoint.correctIndex,
      fact: checkpoint.fact,
      answerDistribution: distribution,
      eliminations,
      leaderboard: leaderboard.slice(0, 5),
      answerResults,
    };
  }

  resumeGame(sessionId: string): { nextCheckpointIndex: number; playersAlive: number } {
    const session = this.requireSession(sessionId);
    this.requireStatus(session, 'running');

    const playersAlive = Array.from(session.players.values()).filter(
      p => p.status === 'alive'
    ).length;

    return {
      nextCheckpointIndex: session.currentCheckpointIndex + 1,
      playersAlive,
    };
  }

  endSession(sessionId: string): LeaderboardEntry[] {
    const session = this.requireSession(sessionId);

    const leaderboard = this.buildLeaderboard(session);
    session.status = 'ended';

    return leaderboard;
  }

  disconnectPlayer(sessionId: string, playerId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const player = session.players.get(playerId);
    if (!player) return;

    if (player.status === 'alive') {
      player.status = 'disconnected';
      player.lastPingMs = Date.now();
    }
  }

  reconnectPlayer(sessionId: string, playerId: string, reconnectWindowMs: number): PlayerState | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const player = session.players.get(playerId);
    if (!player) return null;

    if (player.status !== 'disconnected') return null;

    const elapsed = Date.now() - player.lastPingMs;
    if (elapsed > reconnectWindowMs) {
      session.players.delete(playerId);
      return null;
    }

    player.status = 'alive';
    player.lastPingMs = Date.now();
    return player;
  }

  cleanupDisconnected(sessionId: string, reconnectWindowMs: number): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const removed: string[] = [];
    const now = Date.now();

    for (const [playerId, player] of session.players) {
      if (player.status === 'disconnected' && now - player.lastPingMs > reconnectWindowMs) {
        session.players.delete(playerId);
        removed.push(playerId);
      }
    }

    return removed;
  }

  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.joinCodeToSessionId.delete(session.joinCode);
      this.sessions.delete(sessionId);
    }
  }

  getActivePlayers(sessionId: string): PlayerState[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.players.values()).filter(p => p.status !== 'disconnected');
  }

  getAlivePlayers(sessionId: string): PlayerState[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.players.values()).filter(p => p.status === 'alive');
  }

  getAnsweredCount(sessionId: string): { answeredCount: number; totalAlive: number } {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'checkpoint_active') {
      return { answeredCount: 0, totalAlive: 0 };
    }

    const checkpoint = session.checkpoints[session.currentCheckpointIndex];
    const totalAlive = Array.from(session.players.values()).filter(p => p.status === 'alive').length;

    return {
      answeredCount: checkpoint.answersReceived.size,
      totalAlive,
    };
  }

  isLastCheckpoint(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return session.currentCheckpointIndex >= session.checkpoints.length - 1;
  }

  getCheckpointAggregates(sessionId: string): Array<{
    checkpointId: string;
    answerDistribution: Record<number, number>;
    totalAnswered: number;
    totalCorrect: number;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.checkpoints
      .filter(cp => cp.answersReceived.size > 0)
      .map(cp => {
        const distribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
        let totalCorrect = 0;

        for (const { selectedIndex } of cp.answersReceived.values()) {
          if (selectedIndex >= 0 && selectedIndex <= 3) {
            distribution[selectedIndex]++;
          }
          if (selectedIndex === cp.correctIndex) {
            totalCorrect++;
          }
        }

        return {
          checkpointId: cp.checkpointId,
          answerDistribution: distribution,
          totalAnswered: cp.answersReceived.size,
          totalCorrect,
        };
      });
  }

  private buildLeaderboard(session: SessionState): LeaderboardEntry[] {
    const entries = Array.from(session.players.values()).map(p => ({
      displayName: p.displayName,
      score: p.score,
      survived: p.status === 'alive',
      totalTimeMs: p.answers.reduce((sum, a) => sum + a.timeTakenMs, 0),
    }));

    const sorted = sortLeaderboard(entries);
    return sorted.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }

  private resolveDisplayName(session: SessionState, requestedName: string): string {
    const existingNames = new Set(
      Array.from(session.players.values()).map(p => p.displayName)
    );

    if (!existingNames.has(requestedName)) {
      return requestedName;
    }

    let suffix: string;
    let finalName: string;
    let attempts = 0;
    do {
      suffix = String(Math.floor(Math.random() * 90) + 10);
      finalName = `${requestedName}_${suffix}`;
      attempts++;
    } while (existingNames.has(finalName) && attempts < 100);

    return finalName;
  }

  private requireSession(sessionId: string): SessionState {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('SESSION_NOT_FOUND');
    return session;
  }

  private requireStatus(session: SessionState, expected: SessionStatus): void {
    if (session.status !== expected) {
      throw new Error('INVALID_STATE');
    }
  }
}
