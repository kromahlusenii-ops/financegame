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
    // Get session and verify instructor ownership
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*, lessons(timer_seconds)')
      .eq('id', sessionId)
      .eq('instructor_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const timerSeconds = (session as any).lessons?.timer_seconds ?? 30;
    const newCheckpointIndex = (session.current_checkpoint_index ?? -1) + 1;

    // Get the checkpoint at this index
    const { data: checkpoint, error: cpError } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('lesson_id', session.lesson_id)
      .eq('sort_order', newCheckpointIndex)
      .single();

    if (cpError || !checkpoint) {
      return res.status(400).json({ error: 'No more checkpoints available' });
    }

    // Update session
    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        current_checkpoint_index: newCheckpointIndex,
        status: 'checkpoint_active',
        checkpoint_started_at: new Date().toISOString(),
        timer_seconds: timerSeconds,
      })
      .eq('id', sessionId);

    if (updateError) return res.status(400).json({ error: updateError.message });

    // Broadcast checkpoint start
    await broadcastToSession(sessionId as string, 'checkpoint_start', {
      checkpointIndex: newCheckpointIndex,
      question: checkpoint.question,
      options: checkpoint.options,
      timerSeconds,
    });

    return res.status(200).json({
      success: true,
      checkpointIndex: newCheckpointIndex,
      timerSeconds,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
