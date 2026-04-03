import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CreateSessionSchema, type CheckpointRow } from '@financegame/shared';
import { supabase } from '../lib/supabase.js';
import { validateBody, requireAuth } from '../lib/validate.js';
import { SessionManager } from '../ws/session.js';
import {
  broadcastToSession,
  sendToPlayer,
} from '../ws/broadcast.js';

type AuthRequest = Request & { userId: string };

export function createSessionsRouter(sessionManager: SessionManager): Router {
  const router = Router();

  // POST /api/sessions
  router.post('/', requireAuth, validateBody(CreateSessionSchema), async (req: Request, res: Response) => {
    try {
      const { userId } = req as AuthRequest;
      const { lesson_id } = req.body;

      const { data: lesson } = await supabase
        .from('lessons')
        .select('id')
        .eq('id', lesson_id)
        .eq('instructor_id', userId)
        .single();

      if (!lesson) {
        res.status(404).json({ error: 'Lesson not found' });
        return;
      }

      const sessionId = uuidv4();
      const session = sessionManager.createSession(userId, lesson_id, sessionId);

      await supabase.from('sessions').insert({
        id: sessionId,
        instructor_id: userId,
        lesson_id,
        join_code: session.joinCode,
        status: 'lobby',
      });

      const wsUrl = process.env.VITE_WS_URL || `ws://localhost:${process.env.PORT || 3001}/ws`;

      res.status(201).json({ sessionId, joinCode: session.joinCode, wsUrl });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/sessions/:id/launch
  router.post('/:id/launch', requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = req as AuthRequest;
      const sessionId = req.params.id;
      const session = sessionManager.getSession(sessionId);

      if (!session || session.instructorId !== userId) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const { data: checkpoints, error } = await supabase
        .from('checkpoints')
        .select('*')
        .eq('lesson_id', session.lessonId)
        .order('sort_order', { ascending: true });

      if (error || !checkpoints || checkpoints.length === 0) {
        res.status(400).json({ error: 'No checkpoints found for this lesson' });
        return;
      }

      const parsed: CheckpointRow[] = checkpoints.map(cp => ({
        id: cp.id,
        lesson_id: cp.lesson_id,
        sort_order: cp.sort_order,
        question: cp.question,
        options: cp.options,
        correct_index: cp.correct_index,
        fact: cp.fact,
        created_at: cp.created_at,
      }));

      sessionManager.launchGame(sessionId, parsed);

      await supabase
        .from('sessions')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', sessionId);

      broadcastToSession(sessionId, {
        type: 'game_launched',
        totalCheckpoints: parsed.length,
      });

      res.json({ success: true, totalCheckpoints: parsed.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(400).json({ error: message });
    }
  });

  // POST /api/sessions/:id/checkpoint
  router.post('/:id/checkpoint', requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = req as AuthRequest;
      const sessionId = req.params.id;
      const session = sessionManager.getSession(sessionId);

      if (!session || session.instructorId !== userId) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const { data: lesson } = await supabase
        .from('lessons')
        .select('timer_seconds')
        .eq('id', session.lessonId)
        .single();

      const timerSeconds = lesson?.timer_seconds || 15;
      const checkpoint = sessionManager.fireCheckpoint(sessionId, timerSeconds);

      await supabase
        .from('sessions')
        .update({ status: 'checkpoint_active' })
        .eq('id', sessionId);

      broadcastToSession(sessionId, {
        type: 'checkpoint_start',
        checkpointIndex: session.currentCheckpointIndex,
        question: checkpoint.question,
        options: checkpoint.options,
        timerSeconds: checkpoint.timerSeconds,
      });

      // Countdown timer
      let secondsRemaining = timerSeconds;
      const tickInterval = setInterval(() => {
        secondsRemaining--;
        if (secondsRemaining > 0) {
          broadcastToSession(sessionId, {
            type: 'checkpoint_tick',
            secondsRemaining,
          });
        } else {
          clearInterval(tickInterval);
          try {
            const currentSession = sessionManager.getSession(sessionId);
            if (currentSession && currentSession.status === 'checkpoint_active') {
              const resolution = sessionManager.resolveCheckpoint(sessionId);

              for (const [playerId, result] of resolution.answerResults) {
                sendToPlayer(playerId, { type: 'answer_result', ...result });
              }

              broadcastToSession(sessionId, {
                type: 'checkpoint_results',
                correctIndex: resolution.correctIndex,
                fact: resolution.fact,
                answerDistribution: resolution.answerDistribution,
                eliminations: resolution.eliminations,
                leaderboard: resolution.leaderboard,
              });

              supabase
                .from('sessions')
                .update({ status: 'running' })
                .eq('id', sessionId)
                .then(() => {});
            }
          } catch {
            // Session may have ended
          }
        }
      }, 1000);

      res.json({
        success: true,
        checkpointIndex: session.currentCheckpointIndex,
        timerSeconds,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(400).json({ error: message });
    }
  });

  // POST /api/sessions/:id/end
  router.post('/:id/end', requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = req as AuthRequest;
      const sessionId = req.params.id;
      const session = sessionManager.getSession(sessionId);

      if (!session || session.instructorId !== userId) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const aggregates = sessionManager.getCheckpointAggregates(sessionId);
      const leaderboard = sessionManager.endSession(sessionId);

      const rows = aggregates.map(agg => ({
        session_id: sessionId,
        checkpoint_id: agg.checkpointId,
        answer_distribution: agg.answerDistribution,
        total_answered: agg.totalAnswered,
        total_correct: agg.totalCorrect,
      }));

      if (rows.length > 0) {
        await supabase.from('session_checkpoint_results').insert(rows);
      }

      await supabase
        .from('sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId);

      broadcastToSession(sessionId, {
        type: 'session_ended',
        finalLeaderboard: leaderboard,
      });

      sessionManager.removeSession(sessionId);

      res.json({ success: true, leaderboard });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      res.status(400).json({ error: message });
    }
  });

  // GET /api/sessions
  router.get('/', requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = req as AuthRequest;
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('instructor_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/sessions/:id/results
  router.get('/:id/results', requireAuth, async (req: Request, res: Response) => {
    try {
      const { userId } = req as AuthRequest;

      const { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', req.params.id)
        .eq('instructor_id', userId)
        .single();

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const { data: results, error } = await supabase
        .from('session_checkpoint_results')
        .select('*, checkpoints(question, options, correct_index)')
        .eq('session_id', req.params.id);

      if (error) throw error;

      const parsed = (results || []).map((r: any) => ({
        ...r,
        question: r.checkpoints?.question,
        options: r.checkpoints?.options,
        correct_index: r.checkpoints?.correct_index,
        checkpoints: undefined,
      }));

      res.json({ session, results: parsed });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
