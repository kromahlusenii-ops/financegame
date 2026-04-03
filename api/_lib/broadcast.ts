import { supabase } from './supabase';

export async function broadcastToSession(sessionId: string, event: string, payload: any) {
  const channel = supabase.channel(`session:${sessionId}`);
  await channel.subscribe();
  await channel.send({
    type: 'broadcast',
    event: 'game_event',
    payload: { type: event, ...payload },
  });
  supabase.removeChannel(channel);
}
