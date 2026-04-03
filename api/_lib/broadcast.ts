import { supabase } from './supabase';

export async function broadcastToSession(sessionId: string, event: string, payload: any) {
  const channel = supabase.channel(`session:${sessionId}`);

  // Wait for subscription to be confirmed
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve(); // Don't block if subscription takes too long
    }, 3000);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        reject(new Error(`Channel subscription failed: ${status}`));
      }
    });
  });

  await channel.send({
    type: 'broadcast',
    event: 'game_event',
    payload: { type: event, ...payload },
  });

  // Small delay to ensure message is delivered before cleanup
  await new Promise((r) => setTimeout(r, 200));
  supabase.removeChannel(channel);
}
