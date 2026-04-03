import { describe, it, expect } from 'vitest';
import { calculatePoints, sortLeaderboard } from './scoring.js';

describe('calculatePoints', () => {
  it('returns base 100 + speed bonus for correct answer', () => {
    const points = calculatePoints(true, 7500, 15);
    expect(points).toBe(125); // 100 + round(50 * 0.5)
  });

  it('returns 0 for wrong answer', () => {
    expect(calculatePoints(false, 1000, 15)).toBe(0);
  });

  it('returns max points (150) for instant answer (0ms)', () => {
    expect(calculatePoints(true, 0, 15)).toBe(150);
  });

  it('returns base points (100) when time equals full timer', () => {
    expect(calculatePoints(true, 15000, 15)).toBe(100);
  });

  it('floors bonus at 0 when time exceeds timer', () => {
    expect(calculatePoints(true, 20000, 15)).toBe(100);
  });

  it('caps bonus at 50 for negative time', () => {
    // Edge case: timeTakenMs somehow negative
    expect(calculatePoints(true, -1000, 15)).toBe(150);
  });

  it('works with different timer values', () => {
    expect(calculatePoints(true, 5000, 10)).toBe(125); // 100 + round(50 * 0.5)
    expect(calculatePoints(true, 0, 30)).toBe(150);
  });
});

describe('sortLeaderboard', () => {
  it('sorts by score descending', () => {
    const players = [
      { score: 100, totalTimeMs: 5000 },
      { score: 300, totalTimeMs: 5000 },
      { score: 200, totalTimeMs: 5000 },
    ];
    const sorted = sortLeaderboard(players);
    expect(sorted[0].score).toBe(300);
    expect(sorted[1].score).toBe(200);
    expect(sorted[2].score).toBe(100);
  });

  it('breaks ties by totalTimeMs ascending', () => {
    const players = [
      { score: 200, totalTimeMs: 8000 },
      { score: 200, totalTimeMs: 3000 },
      { score: 200, totalTimeMs: 5000 },
    ];
    const sorted = sortLeaderboard(players);
    expect(sorted[0].totalTimeMs).toBe(3000);
    expect(sorted[1].totalTimeMs).toBe(5000);
    expect(sorted[2].totalTimeMs).toBe(8000);
  });

  it('does not mutate original array', () => {
    const players = [
      { score: 100, totalTimeMs: 5000 },
      { score: 300, totalTimeMs: 5000 },
    ];
    sortLeaderboard(players);
    expect(players[0].score).toBe(100);
  });
});
