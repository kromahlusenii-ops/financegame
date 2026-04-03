import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/ws/session.js';
import type { CheckpointRow } from '@financegame/shared';

const sampleCheckpoints: CheckpointRow[] = [
  {
    id: 'cp-1',
    lesson_id: 'lesson-1',
    sort_order: 0,
    question: 'Q1?',
    options: ['A', 'B', 'C', 'D'],
    correct_index: 1,
    fact: 'Fact 1',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cp-2',
    lesson_id: 'lesson-1',
    sort_order: 1,
    question: 'Q2?',
    options: ['A', 'B', 'C', 'D'],
    correct_index: 2,
    fact: 'Fact 2',
    created_at: new Date().toISOString(),
  },
];

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  describe('createSession', () => {
    it('creates a session with lobby status', () => {
      const session = manager.createSession('instructor-1', 'lesson-1', 'session-1');
      expect(session.status).toBe('lobby');
      expect(session.joinCode).toHaveLength(6);
      expect(session.instructorId).toBe('instructor-1');
    });

    it('generates unique join codes', () => {
      const s1 = manager.createSession('i-1', 'l-1', 's-1');
      const s2 = manager.createSession('i-1', 'l-1', 's-2');
      expect(s1.joinCode).not.toBe(s2.joinCode);
    });

    it('can be retrieved by session ID', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      expect(manager.getSession('s-1')).toBeDefined();
    });

    it('can be retrieved by join code', () => {
      const session = manager.createSession('i-1', 'l-1', 's-1');
      expect(manager.getSessionByCode(session.joinCode)).toBeDefined();
    });
  });

  describe('joinPlayer', () => {
    it('adds a player to the session', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      const player = manager.joinPlayer('s-1', 'Alice');
      expect(player.displayName).toBe('Alice');
      expect(player.lives).toBe(2);
      expect(player.score).toBe(0);
      expect(player.status).toBe('alive');
    });

    it('rejects join when session is not in lobby', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      manager.joinPlayer('s-1', 'Alice');
      manager.launchGame('s-1', sampleCheckpoints);
      expect(() => manager.joinPlayer('s-1', 'Bob')).toThrow('INVALID_STATE');
    });

    it('handles duplicate display names by appending suffix', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      const p1 = manager.joinPlayer('s-1', 'Marcus');
      const p2 = manager.joinPlayer('s-1', 'Marcus');
      expect(p1.displayName).toBe('Marcus');
      expect(p2.displayName).toMatch(/^Marcus_\d{2}$/);
    });

    it('rejects join after max players reached', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      for (let i = 0; i < 50; i++) {
        manager.joinPlayer('s-1', `Player${i}`);
      }
      expect(() => manager.joinPlayer('s-1', 'Extra')).toThrow('MAX_PLAYERS');
    });
  });

  describe('state transitions', () => {
    it('lobby -> running on launch', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      manager.joinPlayer('s-1', 'Alice');
      manager.launchGame('s-1', sampleCheckpoints);
      expect(manager.getSession('s-1')?.status).toBe('running');
    });

    it('running -> checkpoint_active on fireCheckpoint', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      manager.joinPlayer('s-1', 'Alice');
      manager.launchGame('s-1', sampleCheckpoints);
      manager.fireCheckpoint('s-1', 15);
      expect(manager.getSession('s-1')?.status).toBe('checkpoint_active');
    });

    it('checkpoint_active -> running on resolveCheckpoint', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      manager.joinPlayer('s-1', 'Alice');
      manager.launchGame('s-1', sampleCheckpoints);
      manager.fireCheckpoint('s-1', 15);
      manager.resolveCheckpoint('s-1');
      expect(manager.getSession('s-1')?.status).toBe('running');
    });

    it('rejects fireCheckpoint from lobby', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      manager.joinPlayer('s-1', 'Alice');
      expect(() => manager.fireCheckpoint('s-1', 15)).toThrow('INVALID_STATE');
    });

    it('rejects launch without players', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      expect(() => manager.launchGame('s-1', sampleCheckpoints)).toThrow('NO_PLAYERS');
    });

    it('rejects submit_answer when not checkpoint_active', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      const p = manager.joinPlayer('s-1', 'Alice');
      manager.launchGame('s-1', sampleCheckpoints);
      expect(() => manager.submitAnswer('s-1', p.playerId, 0)).toThrow('INVALID_STATE');
    });
  });

  describe('reconnect', () => {
    it('reconnects a player within the window', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      const player = manager.joinPlayer('s-1', 'Alice');
      manager.launchGame('s-1', sampleCheckpoints);
      manager.disconnectPlayer('s-1', player.playerId);

      const reconnected = manager.reconnectPlayer('s-1', player.playerId, 30000);
      expect(reconnected).not.toBeNull();
      expect(reconnected?.status).toBe('alive');
    });

    it('fails reconnect after window expires', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      const player = manager.joinPlayer('s-1', 'Alice');
      manager.launchGame('s-1', sampleCheckpoints);
      manager.disconnectPlayer('s-1', player.playerId);

      // Simulate time passing
      const p = manager.getSession('s-1')?.players.get(player.playerId);
      if (p) p.lastPingMs = Date.now() - 31000;

      const reconnected = manager.reconnectPlayer('s-1', player.playerId, 30000);
      expect(reconnected).toBeNull();
    });
  });

  describe('endSession', () => {
    it('returns final leaderboard', () => {
      manager.createSession('i-1', 'l-1', 's-1');
      manager.joinPlayer('s-1', 'Alice');
      manager.joinPlayer('s-1', 'Bob');
      manager.launchGame('s-1', sampleCheckpoints);

      const leaderboard = manager.endSession('s-1');
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0].rank).toBe(1);
      expect(manager.getSession('s-1')?.status).toBe('ended');
    });
  });
});
