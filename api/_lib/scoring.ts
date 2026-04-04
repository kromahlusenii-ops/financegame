export function calculatePoints(correct: boolean, timeTakenMs: number, timerSeconds: number): number {
  if (!correct) return 0;
  const maxTime = timerSeconds * 1000;
  const timeRatio = Math.max(0, 1 - timeTakenMs / maxTime);
  // Base 500 + up to 500 speed bonus = max 1000 points per question
  return 500 + Math.round(timeRatio * 500);
}
