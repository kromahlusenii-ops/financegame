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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id: sessionId } = req.query;

  try {
    // Get session and verify instructor
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('instructor_id', userId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get checkpoint results with joined checkpoint data
    const { data: results, error: resultsError } = await supabase
      .from('session_checkpoint_results')
      .select('*')
      .eq('session_id', sessionId)
      .order('checkpoint_index', { ascending: true });

    if (resultsError) return res.status(400).json({ error: resultsError.message });

    // Get checkpoint details for each result
    const { data: checkpoints } = await supabase
      .from('checkpoints')
      .select('*')
      .eq('lesson_id', session.lesson_id)
      .order('sort_order', { ascending: true });

    const enrichedResults = (results ?? []).map((r: any) => {
      const cp = (checkpoints ?? []).find((c: any) => c.sort_order === r.checkpoint_index);
      return {
        ...r,
        checkpoint: cp ?? null,
      };
    });

    return res.status(200).json({ session, results: enrichedResults });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
