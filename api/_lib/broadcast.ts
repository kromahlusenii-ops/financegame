export async function broadcastToSession(sessionId: string, event: string, payload: any) {
  // Realtime broadcasts disabled — clients use polling via /api/sessions/[id]/state
  console.log(`[broadcast:noop] ${event} for session ${sessionId}`);
}
