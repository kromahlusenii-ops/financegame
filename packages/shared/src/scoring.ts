export function calculatePoints(correct: boolean, timeTakenMs: number, timerSeconds: number): number {
  if (!correct) return 0;
  const base = 500;
  const maxBonus = 500;
  const ratio = Math.max(0, Math.min(1, 1 - (timeTakenMs / (timerSeconds * 1000))));
  return base + Math.round(maxBonus * ratio);
}

export function sortLeaderboard<T extends { score: number; totalTimeMs: number }>(players: T[]): T[] {
  return [...players].sort((a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs);
}
