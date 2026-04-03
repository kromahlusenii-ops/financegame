import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../_lib/supabase';
import { broadcastToSession } from '../../_lib/broadcast';

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
    const { displayName, joinCode } = req.body;

    if (!displayName || !joinCode) {
      return res.status(400).json({ error: 'displayName and joinCode are required' });
    }

    // Verify session exists and is in lobby
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('join_code', joinCode.toUpperCase())
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'lobby') {
      return res.status(400).json({ error: 'Session is not in lobby state' });
    }

    // Check player count
    const { count: playerCount } = await supabase
      .from('session_players')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);

    if ((playerCount ?? 0) >= 50) {
      return res.status(400).json({ error: 'Session is full (max 50 players)' });
    }

    // Resolve duplicate display names
    let finalDisplayName = displayName;
    const { data: existingPlayers } = await supabase
      .from('session_players')
      .select('display_name')
      .eq('session_id', sessionId);

    const existingNames = new Set((existingPlayers ?? []).map((p: any) => p.display_name));
    if (existingNames.has(finalDisplayName)) {
      const suffix = Math.random().toString(36).substring(2, 5);
      finalDisplayName = `${displayName}_${suffix}`;
    }

    // Insert player
    const { data: player, error: insertError } = await supabase
      .from('session_players')
      .insert({
        session_id: sessionId,
        display_name: finalDisplayName,
        score: 0,
        lives: 2,
        status: 'alive',
        total_time_ms: 0,
      })
      .select()
      .single();

    if (insertError) return res.status(400).json({ error: insertError.message });

    // Get all players for response
    const { data: allPlayers } = await supabase
      .from('session_players')
      .select('id, display_name')
      .eq('session_id', sessionId);

    const newPlayerCount = allPlayers?.length ?? 0;

    // Broadcast player joined
    await broadcastToSession(sessionId as string, 'player_joined', {
      playerId: player.id,
      displayName: finalDisplayName,
      playerCount: newPlayerCount,
    });

    // Broadcast lobby update
    await broadcastToSession(sessionId as string, 'lobby_update', {
      players: (allPlayers ?? []).map((p: any) => ({ playerId: p.id, displayName: p.display_name })),
      playerCount: newPlayerCount,
    });

    return res.status(200).json({
      playerId: player.id,
      displayName: finalDisplayName,
      sessionId,
      sessionStatus: session.status,
      players: (allPlayers ?? []).map((p: any) => ({ playerId: p.id, displayName: p.display_name })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
