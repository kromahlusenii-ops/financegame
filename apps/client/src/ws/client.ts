import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl ? createClient(supabaseUrl, supabaseAnonKey) : null;

type MessageHandler = (message: any) => void;

export class GameChannel {
  private channel: RealtimeChannel | null = null;
  private handlers = new Set<MessageHandler>();
  private _isConnected = false;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  connect(): void {
    if (!supabase) return;

    this.channel = supabase.channel(`session:${this.sessionId}`, {
      config: { broadcast: { self: false } },
    });

    // Listen for all game events via a single broadcast event name
    this.channel.on('broadcast', { event: 'game_event' }, ({ payload }) => {
      this.handlers.forEach((h) => h(payload));
    });

    // Track presence for player positions
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel!.presenceState();
      const positions: { playerId: string; positionX: number }[] = [];
      for (const [_key, entries] of Object.entries(state)) {
        for (const entry of entries as any[]) {
          if (entry.positionX !== undefined) {
            positions.push({ playerId: entry.playerId, positionX: entry.positionX });
          }
        }
      }
      if (positions.length > 0) {
        this.handlers.forEach((h) => h({ type: 'player_positions', positions }));
      }
    });

    this.channel.subscribe((status) => {
      this._isConnected = status === 'SUBSCRIBED';
    });
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // Send position via Presence (high frequency, no server round-trip needed)
  trackPosition(playerId: string, positionX: number): void {
    if (!this.channel) return;
    this.channel.track({ playerId, positionX });
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  disconnect(): void {
    if (this.channel && supabase) {
      supabase.removeChannel(this.channel);
    }
    this.channel = null;
    this._isConnected = false;
    this.handlers.clear();
  }
}
