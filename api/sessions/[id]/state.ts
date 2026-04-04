import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: sessionId } = req.query;

  try {
    // 1. Get session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status, current_checkpoint_index, checkpoint_started_at, timer_seconds, lesson_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // 2. Get players
    const { data: players } = await supabase
      .from('session_players')
      .select('id, display_name, score, lives, status, total_time_ms')
      .eq('session_id', sessionId)
      .order('score', { ascending: false });

    // 3. Count total checkpoints
    const { count: totalCheckpoints } = await supabase
      .from('checkpoints')
      .select('*', { count: 'exact', head: true })
      .eq('lesson_id', session.lesson_id);

    const response: any = {
      session: {
        id: session.id,
        status: session.status,
        currentCheckpointIndex: session.current_checkpoint_index ?? -1,
        checkpointStartedAt: session.checkpoint_started_at,
        timerSeconds: session.timer_seconds ?? 15,
        totalCheckpoints: totalCheckpoints ?? 0,
      },
      players: (players ?? []).map((p: any) => ({
        id: p.id,
        displayName: p.display_name,
        score: p.score,
        lives: p.lives,
        status: p.status,
        totalTimeMs: p.total_time_ms,
      })),
    };

    // 4. If checkpoint_active, include checkpoint data + answer counts
    if (session.status === 'checkpoint_active' && session.current_checkpoint_index >= 0) {
      const { data: checkpoint } = await supabase
        .from('checkpoints')
        .select('question, options, correct_index, fact')
        .eq('lesson_id', session.lesson_id)
        .eq('sort_order', session.current_checkpoint_index)
        .single();

      const { count: answeredCount } = await supabase
        .from('session_answers')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('checkpoint_index', session.current_checkpoint_index);

      const alivePlayers = (players ?? []).filter((p: any) => p.status === 'alive');

      if (checkpoint) {
        response.checkpoint = {
          question: checkpoint.question,
          options: checkpoint.options,
          timerSeconds: session.timer_seconds ?? 15,
          checkpointIndex: session.current_checkpoint_index,
          answeredCount: answeredCount ?? 0,
          totalAlive: alivePlayers.length,
        };
      }
    }

    // 5. If running and checkpoint_index >= 0, include last results
    if (session.status === 'running' && session.current_checkpoint_index >= 0) {
      const { data: answers } = await supabase
        .from('session_answers')
        .select('selected_index, correct, player_id')
        .eq('session_id', sessionId)
        .eq('checkpoint_index', session.current_checkpoint_index);

      if (answers && answers.length > 0) {
        const { data: checkpoint } = await supabase
          .from('checkpoints')
          .select('correct_index, fact')
          .eq('lesson_id', session.lesson_id)
          .eq('sort_order', session.current_checkpoint_index)
          .single();

        // Build answer distribution
        const dist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
        for (const a of answers) {
          if (a.selected_index >= 0 && a.selected_index <= 3) {
            dist[a.selected_index]++;
          }
        }

        // Find eliminations (players with 0 lives who answered wrong on this checkpoint)
        const wrongPlayerIds = answers.filter((a: any) => !a.correct).map((a: any) => a.player_id);
        const eliminations = (players ?? [])
          .filter((p: any) => p.status === 'eliminated' && p.lives === 0 && wrongPlayerIds.includes(p.id))
          .map((p: any) => ({ playerId: p.id, displayName: p.display_name }));

        // Build leaderboard
        const leaderboard = (players ?? []).map((p: any, i: number) => ({
          rank: i + 1,
          playerId: p.id,
          displayName: p.display_name,
          score: p.score,
          lives: p.lives,
          status: p.status,
          totalTimeMs: p.total_time_ms,
          survived: p.status === 'alive',
        }));

        response.results = {
          correctIndex: checkpoint?.correct_index ?? 0,
          fact: checkpoint?.fact ?? '',
          answerDistribution: dist,
          eliminations,
          leaderboard,
        };
      }
    }

    // 6. If ended, include final leaderboard
    if (session.status === 'ended') {
      response.finalLeaderboard = (players ?? []).map((p: any, i: number) => ({
        rank: i + 1,
        playerId: p.id,
        displayName: p.display_name,
        score: p.score,
        lives: p.lives,
        status: p.status,
        survived: p.status === 'alive',
        totalTimeMs: p.total_time_ms,
      }));
    }

    return res.status(200).json(response);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
