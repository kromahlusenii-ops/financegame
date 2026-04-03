import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';

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

  const { id: lessonId } = req.query;

  try {
    // Verify lesson belongs to instructor
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id')
      .eq('id', lessonId)
      .eq('instructor_id', userId)
      .single();

    if (lessonError || !lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const { question, options, correct_index, fact, sort_order } = req.body;

    if (!question || !options || correct_index === undefined) {
      return res.status(400).json({ error: 'question, options, and correct_index are required' });
    }

    const { data, error } = await supabase
      .from('checkpoints')
      .insert({
        lesson_id: lessonId,
        question,
        options,
        correct_index,
        fact: fact ?? null,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
