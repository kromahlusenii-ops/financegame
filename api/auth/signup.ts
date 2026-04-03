import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'email, password, and displayName are required' });
    }

    // Create user via admin API
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      return res.status(400).json({ error: createError.message });
    }

    const userId = createData.user.id;

    // Insert instructor profile
    const { error: profileError } = await supabase
      .from('instructor_profiles')
      .insert({ id: userId, display_name: displayName });

    if (profileError) {
      // Clean up: delete the created user
      await supabase.auth.admin.deleteUser(userId);
      return res.status(400).json({ error: profileError.message });
    }

    // Sign in to get token
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      return res.status(400).json({ error: signInError.message });
    }

    return res.status(201).json({
      user: {
        id: userId,
        email,
        display_name: displayName,
      },
      token: signInData.session.access_token,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
