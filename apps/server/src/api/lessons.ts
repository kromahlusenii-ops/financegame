import { Router, type Request, type Response } from 'express';
import {
  CreateLessonSchema,
  UpdateLessonSchema,
  CreateCheckpointSchema,
  UpdateCheckpointSchema,
  ReorderCheckpointsSchema,
} from '@financegame/shared';
import { supabase } from '../lib/supabase.js';
import { validateBody, requireAuth } from '../lib/validate.js';

const router = Router();

type AuthRequest = Request & { userId: string };

// POST /api/lessons
router.post('/', requireAuth, validateBody(CreateLessonSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthRequest;
    const { title, timer_seconds } = req.body;

    const { data, error } = await supabase
      .from('lessons')
      .insert({ instructor_id: userId, title, timer_seconds })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lessons
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthRequest;

    const { data: lessons, error } = await supabase
      .from('lessons')
      .select('*, checkpoints(count)')
      .eq('instructor_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform the count from Supabase's nested format
    const result = (lessons || []).map((l: any) => ({
      ...l,
      checkpoint_count: l.checkpoints?.[0]?.count || 0,
      checkpoints: undefined,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lessons/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthRequest;

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', req.params.id)
      .eq('instructor_id', userId)
      .single();

    if (lessonError || !lesson) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }

    const { data: checkpoints, error: cpError } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('lesson_id', req.params.id)
      .order('sort_order', { ascending: true });

    if (cpError) throw cpError;

    res.json({ ...lesson, checkpoints: checkpoints || [] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/lessons/:id
router.put('/:id', requireAuth, validateBody(UpdateLessonSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthRequest;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.timer_seconds !== undefined) updates.timer_seconds = req.body.timer_seconds;

    const { data, error } = await supabase
      .from('lessons')
      .update(updates)
      .eq('id', req.params.id)
      .eq('instructor_id', userId)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/lessons/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthRequest;
    await supabase.from('lessons').delete().eq('id', req.params.id).eq('instructor_id', userId);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lessons/:id/checkpoints
router.post('/:id/checkpoints', requireAuth, validateBody(CreateCheckpointSchema), async (req: Request, res: Response) => {
  try {
    const { userId } = req as AuthRequest;

    const { data: lesson } = await supabase
      .from('lessons')
      .select('id')
      .eq('id', req.params.id)
      .eq('instructor_id', userId)
      .single();

    if (!lesson) {
      res.status(404).json({ error: 'Lesson not found' });
      return;
    }

    const { question, options, correct_index, fact, sort_order } = req.body;

    const { data, error } = await supabase
      .from('checkpoints')
      .insert({ lesson_id: req.params.id, sort_order, question, options, correct_index, fact })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/checkpoints/:id
router.put('/checkpoints/:id', requireAuth, validateBody(UpdateCheckpointSchema), async (req: Request, res: Response) => {
  try {
    const updates: Record<string, unknown> = {};
    if (req.body.question !== undefined) updates.question = req.body.question;
    if (req.body.options !== undefined) updates.options = req.body.options;
    if (req.body.correct_index !== undefined) updates.correct_index = req.body.correct_index;
    if (req.body.fact !== undefined) updates.fact = req.body.fact;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const { data, error } = await supabase
      .from('checkpoints')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Checkpoint not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/checkpoints/:id
router.delete('/checkpoints/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await supabase.from('checkpoints').delete().eq('id', req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/checkpoints/reorder
router.put('/checkpoints/reorder', requireAuth, validateBody(ReorderCheckpointsSchema), async (req: Request, res: Response) => {
  try {
    const updates = req.body.checkpoints.map((cp: { id: string; sort_order: number }) =>
      supabase.from('checkpoints').update({ sort_order: cp.sort_order }).eq('id', cp.id)
    );
    await Promise.all(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as lessonsRouter };
