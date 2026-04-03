import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';

const JOIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
  }
  return code;
}

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

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('instructor_id', userId)
        .order('created_at', { ascending: false });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { lesson_id } = req.body;

      if (!lesson_id) {
        return res.status(400).json({ error: 'lesson_id is required' });
      }

      // Generate unique join code
      let joinCode: string;
      let isUnique = false;
      do {
        joinCode = generateJoinCode();
        const { data: existing } = await supabase
          .from('sessions')
          .select('id')
          .eq('join_code', joinCode)
          .neq('status', 'ended')
          .limit(1);
        isUnique = !existing || existing.length === 0;
      } while (!isUnique);

      const { data, error } = await supabase
        .from('sessions')
        .insert({
          instructor_id: userId,
          lesson_id,
          join_code: joinCode,
          status: 'lobby',
        })
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json({ sessionId: data.id, joinCode: data.join_code });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
