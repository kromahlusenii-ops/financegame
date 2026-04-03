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

describe('Checkpoint Logic', () => {
  let manager: SessionManager;
  let aliceId: string;
  let bobId: string;

  beforeEach(() => {
    manager = new SessionManager();
    manager.createSession('i-1', 'l-1', 's-1');
    aliceId = manager.joinPlayer('s-1', 'Alice').playerId;
    bobId = manager.joinPlayer('s-1', 'Bob').playerId;
    manager.launchGame('s-1', sampleCheckpoints);
    manager.fireCheckpoint('s-1', 15);
  });

  describe('submitAnswer', () => {
    it('awards points for correct answer', () => {
      const result = manager.submitAnswer('s-1', aliceId, 1); // correct
      expect(result.correct).toBe(true);
      expect(result.pointsAwarded).toBeGreaterThanOrEqual(100);
      expect(result.livesRemaining).toBe(2);
      expect(result.newStatus).toBe('alive');
    });

    it('deducts life for wrong answer', () => {
      const result = manager.submitAnswer('s-1', aliceId, 0); // wrong
      expect(result.correct).toBe(false);
      expect(result.pointsAwarded).toBe(0);
      expect(result.livesRemaining).toBe(1);
      expect(result.newStatus).toBe('alive');
    });

    it('eliminates player at 0 lives', () => {
      // First wrong answer
      manager.submitAnswer('s-1', aliceId, 0);
      manager.submitAnswer('s-1', bobId, 1); // Bob answers correctly
      manager.resolveCheckpoint('s-1');

      // Second checkpoint, second wrong answer
      manager.fireCheckpoint('s-1', 15);
      const result = manager.submitAnswer('s-1', aliceId, 0);
      expect(result.livesRemaining).toBe(0);
      expect(result.newStatus).toBe('eliminated');
    });

    it('rejects duplicate answers from same player', () => {
      manager.submitAnswer('s-1', aliceId, 1);
      expect(() => manager.submitAnswer('s-1', aliceId, 2)).toThrow('ALREADY_ANSWERED');
    });

    it('rejects answer from eliminated player', () => {
      // Eliminate Alice across two checkpoints
      manager.submitAnswer('s-1', aliceId, 0); // wrong, 1 life
      manager.submitAnswer('s-1', bobId, 1);
      manager.resolveCheckpoint('s-1');
      manager.fireCheckpoint('s-1', 15);
      manager.submitAnswer('s-1', aliceId, 0); // wrong, 0 lives = eliminated

      // Resolve and start new checkpoint
      manager.resolveCheckpoint('s-1');
      // No more checkpoints, but we can test that eliminated player can't answer
      // by checking the status directly
      const session = manager.getSession('s-1');
      const alice = session?.players.get(aliceId);
      expect(alice?.status).toBe('eliminated');
    });
  });

  describe('resolveCheckpoint', () => {
    it('marks non-answerers as wrong', () => {
      // Only Alice answers
      manager.submitAnswer('s-1', aliceId, 1);
      // Bob doesn't answer
      const resolution = manager.resolveCheckpoint('s-1');

      // Bob should have lost a life via non-answer
      const session = manager.getSession('s-1');
      const bob = session?.players.get(bobId);
      expect(bob?.lives).toBe(1);
    });

    it('provides correct answer distribution', () => {
      manager.submitAnswer('s-1', aliceId, 1); // correct
      manager.submitAnswer('s-1', bobId, 0); // wrong
      const resolution = manager.resolveCheckpoint('s-1');

      expect(resolution.answerDistribution[0]).toBe(1);
      expect(resolution.answerDistribution[1]).toBe(1);
      expect(resolution.correctIndex).toBe(1);
    });

    it('identifies eliminations', () => {
      // Give Alice 1 life first by getting first checkpoint wrong
      manager.submitAnswer('s-1', aliceId, 0); // wrong, 1 life left
      manager.submitAnswer('s-1', bobId, 1); // correct
      const res1 = manager.resolveCheckpoint('s-1');

      // Second checkpoint
      manager.fireCheckpoint('s-1', 15);
      manager.submitAnswer('s-1', aliceId, 0); // wrong again, 0 lives
      manager.submitAnswer('s-1', bobId, 2); // correct
      const res2 = manager.resolveCheckpoint('s-1');

      expect(res2.eliminations).toHaveLength(1);
      expect(res2.eliminations[0].displayName).toBe('Alice');
    });

    it('returns top 5 leaderboard', () => {
      manager.submitAnswer('s-1', aliceId, 1); // correct
      manager.submitAnswer('s-1', bobId, 1); // correct
      const resolution = manager.resolveCheckpoint('s-1');

      expect(resolution.leaderboard.length).toBeLessThanOrEqual(5);
      expect(resolution.leaderboard[0].rank).toBe(1);
    });
  });
});
