export function calculatePoints(correct: boolean, timeTakenMs: number, timerSeconds: number): number {
  if (!correct) return 0;
  const maxTime = timerSeconds * 1000;
  const timeRatio = Math.max(0, 1 - timeTakenMs / maxTime);
  return 100 + Math.round(timeRatio * 50);
}
