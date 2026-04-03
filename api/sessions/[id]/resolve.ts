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
    // Get session and verify
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('instructor_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'checkpoint_active') {
      return res.status(400).json({ error: 'No active checkpoint to resolve' });
    }

    const checkpointIndex = session.current_checkpoint_index;

    // Get the checkpoint for correct_index and fact
    const { data: checkpoint } = await supabase
      .from('checkpoints')
      .select('correct_index, fact')
      .eq('lesson_id', session.lesson_id)
      .eq('sort_order', checkpointIndex)
      .single();

    const correctIndex = checkpoint?.correct_index ?? 0;
    const fact = checkpoint?.fact ?? '';

    // Get all alive players
    const { data: alivePlayers } = await supabase
      .from('session_players')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'alive');

    // Get all answers for this checkpoint
    const { data: answers } = await supabase
      .from('session_answers')
      .select('*')
      .eq('session_id', sessionId)
      .eq('checkpoint_index', checkpointIndex);

    const answeredPlayerIds = new Set((answers ?? []).map((a: any) => a.player_id));

    // Handle players who didn't answer
    const newlyEliminated: string[] = [];
    for (const player of alivePlayers ?? []) {
      if (!answeredPlayerIds.has(player.id)) {
        const newLives = player.lives - 1;
        const newStatus = newLives <= 0 ? 'eliminated' : 'alive';

        if (newStatus === 'eliminated') {
          newlyEliminated.push(player.id);
        }

        await supabase
          .from('session_players')
          .update({ lives: newLives, status: newStatus })
          .eq('id', player.id);

        // Insert missed answer record
        await supabase.from('session_answers').insert({
          session_id: sessionId,
          player_id: player.id,
          checkpoint_index: checkpointIndex,
          selected_index: -1,
          correct: false,
          points_awarded: 0,
          time_taken_ms: 0,
        });

        // Broadcast individual result for non-answerers
        await broadcastToSession(sessionId as string, 'answer_result', {
          playerId: player.id,
          correct: false,
          correctIndex,
          pointsAwarded: 0,
          livesRemaining: newLives,
          newStatus,
          fact,
        });
      }
    }

    // Also track eliminations from players who answered wrong and lost their last life
    const { data: eliminatedFromAnswers } = await supabase
      .from('session_players')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'eliminated')
      .in('id', (answers ?? []).filter((a: any) => !a.correct).map((a: any) => a.player_id));

    const allEliminations = [
      ...newlyEliminated,
      ...(eliminatedFromAnswers ?? []).map((p: any) => p.id),
    ];

    // Build answer distribution
    const answerDistribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const allAnswers = [
      ...(answers ?? []),
    ];
    // Re-fetch to include the just-inserted missed answers
    const { data: finalAnswers } = await supabase
      .from('session_answers')
      .select('selected_index')
      .eq('session_id', sessionId)
      .eq('checkpoint_index', checkpointIndex);

    for (const a of finalAnswers ?? []) {
      if (a.selected_index >= 0 && a.selected_index <= 3) {
        answerDistribution[a.selected_index] = (answerDistribution[a.selected_index] || 0) + 1;
      }
    }

    // Build leaderboard
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

    // Update session status back to running
    await supabase
      .from('sessions')
      .update({ status: 'running' })
      .eq('id', sessionId);

    // Broadcast checkpoint results
    await broadcastToSession(sessionId as string, 'checkpoint_results', {
      correctIndex,
      fact,
      answerDistribution,
      eliminations: allEliminations,
      leaderboard,
    });

    return res.status(200).json({
      success: true,
      correctIndex,
      answerDistribution,
      eliminations: allEliminations,
      leaderboard,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
