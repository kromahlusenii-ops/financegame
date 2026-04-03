import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { broadcastToSession } from '../../_lib/broadcast';

async function getUserId(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id: sessionId } = req.query;

  try {
    // Get session and verify ownership
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('instructor_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get checkpoints for this lesson
    const { data: checkpoints, error: cpError } = await supabase
      .from('checkpoints')
      .select('id')
      .eq('lesson_id', session.lesson_id)
      .order('sort_order', { ascending: true });

    if (cpError) return res.status(400).json({ error: cpError.message });

    const totalCheckpoints = checkpoints?.length ?? 0;

    // Update session status
    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) return res.status(400).json({ error: updateError.message });

    // Broadcast game launched
    await broadcastToSession(sessionId as string, 'game_launched', { totalCheckpoints });

    return res.status(200).json({ success: true, totalCheckpoints });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
