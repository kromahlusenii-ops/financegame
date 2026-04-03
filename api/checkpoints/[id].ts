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
    // Verify checkpoint belongs to a lesson owned by this instructor
    const { data: checkpoint, error: checkError } = await supabase
      .from('checkpoints')
      .select('*, lessons!inner(instructor_id)')
      .eq('id', id)
      .single();

    if (checkError || !checkpoint) {
      return res.status(404).json({ error: 'Checkpoint not found' });
    }

    if ((checkpoint as any).lessons.instructor_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.method === 'PUT') {
      const { question, options, correct_index, fact, sort_order } = req.body;
      const updates: Record<string, any> = {};
      if (question !== undefined) updates.question = question;
      if (options !== undefined) updates.options = options;
      if (correct_index !== undefined) updates.correct_index = correct_index;
      if (fact !== undefined) updates.fact = fact;
      if (sort_order !== undefined) updates.sort_order = sort_order;

      const { data, error } = await supabase
        .from('checkpoints')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('checkpoints')
        .delete()
        .eq('id', id);

      if (error) return res.status(400).json({ error: error.message });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
