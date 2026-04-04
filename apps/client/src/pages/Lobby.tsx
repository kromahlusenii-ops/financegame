import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSessionPolling } from '../ws/useSessionPolling';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface LobbyState {
  joinCode: string;
  displayName: string;
  sessionId: string;
  lessonTitle: string;
}

export default function Lobby() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LobbyState | null;
  const { onMessage, state: sessionState } = useSessionPolling(state?.sessionId || null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const joinedRef = useRef(false);

  // Listen for game_launched to navigate
  useEffect(() => {
    if (!state) {
      navigate('/join');
      return;
    }

    const unsub = onMessage((msg: any) => {
      if (msg.type === 'game_launched') {
        navigate('/game', {
          state: {
            playerId,
            sessionId: state.sessionId,
            totalCheckpoints: msg.totalCheckpoints,
            role: 'student',
          },
        });
      }
    });

    return unsub;
  }, [state, onMessage, navigate, playerId]);

  // Navigate to game if session already launched (detected via polling state)
  useEffect(() => {
    if (!state || !playerId || !sessionState) return;
    const status = sessionState.session.status;
    if (status === 'running' || status === 'checkpoint_active') {
      navigate('/game', {
        state: {
          playerId,
          sessionId: state.sessionId,
          totalCheckpoints: sessionState.session.totalCheckpoints,
          role: 'student',
        },
      });
    }
  }, [sessionState, state, playerId, navigate]);

  // Join via HTTP POST immediately
  useEffect(() => {
    if (state && !joinedRef.current) {
      joinedRef.current = true;
      joinSession();
    }
  }, [state]);

  async function joinSession() {
    if (!state) return;
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${state.sessionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: state.displayName,
          joinCode: state.joinCode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to join session');
        return;
      }

      const data = await res.json();
      setPlayerId(data.playerId);
    } catch {
      setError('Could not connect to server');
    }
  }

  if (!state) return null;

  // Player list from polling state
  const players = sessionState?.players ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex flex-col items-center justify-center px-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 w-full max-w-md text-center">
        <h2 className="text-2xl font-bold text-white mb-2">{state.lessonTitle}</h2>
        <p className="text-purple-200 mb-6">
          Waiting for instructor to start
          <span className="animate-pulse">...</span>
        </p>

        {error && (
          <div className="bg-red-500/20 border border-red-400 text-red-200 px-4 py-2 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <div className="bg-white/5 rounded-xl p-4 mb-4">
          <p className="text-purple-300 text-sm mb-2">Players ({players.length})</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {players.map((p) => (
              <span
                key={p.id}
                className={`px-3 py-1 rounded-full text-sm ${
                  p.id === playerId
                    ? 'bg-green-500 text-white'
                    : 'bg-white/10 text-purple-200'
                }`}
              >
                {p.displayName}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
