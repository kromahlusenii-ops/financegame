import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.query;

  try {
    const joinCode = (code as string).toUpperCase();

    // Find session by join code that isn't ended
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status, lesson_id')
      .eq('join_code', joinCode)
      .neq('status', 'ended')
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get lesson title
    const { data: lesson } = await supabase
      .from('lessons')
      .select('title')
      .eq('id', session.lesson_id)
      .single();

    // Get players
    const { data: players } = await supabase
      .from('session_players')
      .select('id, display_name')
      .eq('session_id', session.id);

    return res.status(200).json({
      sessionId: session.id,
      lessonTitle: lesson?.title ?? '',
      playerCount: players?.length ?? 0,
      players: (players ?? []).map((p: any) => ({ id: p.id, name: p.display_name })),
      status: session.status,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
