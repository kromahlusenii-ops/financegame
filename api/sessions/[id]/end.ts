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
    // Get session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('instructor_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get all checkpoints for this lesson
    const { data: checkpoints } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('lesson_id', session.lesson_id)
      .order('sort_order', { ascending: true });

    // Aggregate answers per checkpoint and insert into session_checkpoint_results
    for (let i = 0; i < (checkpoints ?? []).length; i++) {
      const cp = checkpoints![i];

      const { data: cpAnswers } = await supabase
        .from('session_answers')
        .select('selected_index, correct')
        .eq('session_id', sessionId)
        .eq('checkpoint_index', i);

      const distribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      let totalAnswered = 0;
      let totalCorrect = 0;

      for (const a of cpAnswers ?? []) {
        if (a.selected_index >= 0 && a.selected_index <= 3) {
          distribution[a.selected_index] = (distribution[a.selected_index] || 0) + 1;
        }
        totalAnswered++;
        if (a.correct) totalCorrect++;
      }

      await supabase.from('session_checkpoint_results').insert({
        session_id: sessionId,
        checkpoint_index: i,
        answer_distribution: distribution,
        total_answered: totalAnswered,
        total_correct: totalCorrect,
      });
    }

    // Build final leaderboard
    const { data: allPlayers } = await supabase
      .from('session_players')
      .select('id, display_name, score, lives, status, total_time_ms')
      .eq('session_id', sessionId)
      .order('score', { ascending: false })
      .order('total_time_ms', { ascending: true });

    const leaderboard = (allPlayers ?? []).map((p: any, i: number) => ({
      rank: i + 1,
      playerId: p.id,
      displayName: p.display_name,
      score: p.score,
      lives: p.lives,
      status: p.status,
      totalTimeMs: p.total_time_ms,
    }));

    // Update session to ended
    await supabase
      .from('sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // Broadcast session ended
    await broadcastToSession(sessionId as string, 'session_ended', {
      finalLeaderboard: leaderboard,
    });

    return res.status(200).json({ success: true, leaderboard });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
