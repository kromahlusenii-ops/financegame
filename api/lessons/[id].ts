import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';

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

  const userId = await getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('lessons')
        .select('*, checkpoints(*)')
        .eq('id', id)
        .eq('instructor_id', userId)
        .single();

      if (error) return res.status(404).json({ error: 'Lesson not found' });
      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const { title, timer_seconds } = req.body;
      const updates: Record<string, any> = {};
      if (title !== undefined) updates.title = title;
      if (timer_seconds !== undefined) updates.timer_seconds = timer_seconds;

      const { data, error } = await supabase
        .from('lessons')
        .update(updates)
        .eq('id', id)
        .eq('instructor_id', userId)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('lessons')
        .delete()
        .eq('id', id)
        .eq('instructor_id', userId);

      if (error) return res.status(400).json({ error: error.message });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
