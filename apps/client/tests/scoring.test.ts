import { describe, it, expect } from 'vitest';
import { calculatePoints, sortLeaderboard } from '@financegame/shared';

describe('Client-side scoring (re-exports from shared)', () => {
  it('calculates correct points for a correct answer', () => {
    expect(calculatePoints(true, 7500, 15)).toBe(750);
  });

  it('returns 0 for wrong answer', () => {
    expect(calculatePoints(false, 5000, 15)).toBe(0);
  });

  it('sorts leaderboard correctly', () => {
    const sorted = sortLeaderboard([
      { score: 100, totalTimeMs: 5000 },
      { score: 200, totalTimeMs: 3000 },
    ]);
    expect(sorted[0].score).toBe(200);
  });
});
