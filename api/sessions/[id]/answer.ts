import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { broadcastToSession } from '../../_lib/broadcast';
import { calculatePoints } from '../../_lib/scoring';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: sessionId } = req.query;

  try {
    const { playerId, selectedIndex, runScore } = req.body;

    if (!playerId || selectedIndex === undefined) {
      return res.status(400).json({ error: 'playerId and selectedIndex are required' });
    }

    // Runner coin score from client (capped to prevent abuse)
    const coinScore = Math.max(0, Math.min(runScore || 0, 500));

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'checkpoint_active') {
      return res.status(400).json({ error: 'No active checkpoint' });
    }

    // Get player
    const { data: player, error: playerError } = await supabase
      .from('session_players')
      .select('*')
      .eq('id', playerId)
      .eq('session_id', sessionId)
      .single();

    if (playerError || !player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    if (player.status !== 'alive') {
      return res.status(400).json({ error: 'Player is eliminated' });
    }

    const checkpointIndex = session.current_checkpoint_index;

    // Check if already answered
    const { data: existingAnswer } = await supabase
      .from('session_answers')
      .select('id')
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
      .eq('checkpoint_index', checkpointIndex)
      .limit(1);

    if (existingAnswer && existingAnswer.length > 0) {
      return res.status(400).json({ error: 'Already answered this checkpoint' });
    }

    // Get checkpoint for correct answer
    const { data: checkpoint } = await supabase
      .from('checkpoints')
      .select('correct_index, fact')
      .eq('lesson_id', session.lesson_id)
      .eq('sort_order', checkpointIndex)
      .single();

    const correctIndex = checkpoint?.correct_index ?? 0;
    const fact = checkpoint?.fact ?? '';
    const correct = selectedIndex === correctIndex;

    // Calculate time taken
    const checkpointStarted = new Date(session.checkpoint_started_at).getTime();
    const timeTakenMs = Date.now() - checkpointStarted;
    const timerSeconds = session.timer_seconds ?? 30;

    // Calculate points
    const pointsAwarded = calculatePoints(correct, timeTakenMs, timerSeconds);

    // Update player
    const newLives = correct ? player.lives : player.lives - 1;
    const newStatus = newLives <= 0 ? 'eliminated' : 'alive';
    const newScore = player.score + pointsAwarded + coinScore;
    const newTotalTime = (player.total_time_ms || 0) + timeTakenMs;

    await supabase
      .from('session_players')
      .update({
        score: newScore,
        lives: newLives,
        status: newStatus,
        total_time_ms: newTotalTime,
      })
      .eq('id', playerId);

    // Insert answer
    await supabase.from('session_answers').insert({
      session_id: sessionId,
      player_id: playerId,
      checkpoint_index: checkpointIndex,
      selected_index: selectedIndex,
      correct,
      points_awarded: pointsAwarded,
      time_taken_ms: timeTakenMs,
    });

    // Get counts for live update
    const { count: answeredCount } = await supabase
      .from('session_answers')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('checkpoint_index', checkpointIndex);

    const { count: totalAlive } = await supabase
      .from('session_players')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'alive');

    // Broadcast live answer count
    await broadcastToSession(sessionId as string, 'checkpoint_answers_live', {
      answeredCount: answeredCount ?? 0,
      totalAlive: (totalAlive ?? 0) + (newStatus === 'eliminated' ? 1 : 0),
    });

    return res.status(200).json({
      correct,
      correctIndex,
      pointsAwarded,
      livesRemaining: newLives,
      newStatus,
      fact,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
