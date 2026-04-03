import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAuthHeaders } from '../lib/supabase';
import { useGameChannel } from '../ws/useGameChannel';
import QRCode from 'qrcode';

const API_BASE = import.meta.env.VITE_API_URL || '';
const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173';

export default function SessionLobby() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { onMessage } = useGameChannel(id || null);
  const [joinCode, setJoinCode] = useState('');
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadSession();
  }, []);

  async function loadSession() {
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, { headers: getAuthHeaders() });
      if (!res.ok) return;

      const sessions = await res.json();
      const current = sessions.find((s: { id: string }) => s.id === id);
      if (current) {
        setJoinCode(current.join_code);
        const joinUrl = `${APP_URL}/join/${current.join_code}`;
        try {
          const qr = await QRCode.toDataURL(joinUrl, { width: 200, margin: 2 });
          setQrDataUrl(qr);
        } catch {
          // QR generation failed
        }
      }
    } catch {
      // Load failed
    }
  }

  useEffect(() => {
    const unsub = onMessage((msg: any) => {
      switch (msg.type) {
        case 'lobby_update':
          setPlayers(msg.players);
          break;
        case 'player_joined':
          setPlayers(prev => {
            if (prev.some(p => p.id === msg.playerId)) return prev;
            return [...prev, { id: msg.playerId, name: msg.displayName }];
          });
          break;
        case 'player_left':
          setPlayers(prev => prev.filter(p => p.id !== msg.playerId));
          break;
      }
    });
    return unsub;
  }, [onMessage]);

  async function launchGame() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${id}/launch`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        navigate(`/instructor/sessions/${id}/live`);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to launch');
      }
    } catch {
      alert('Failed to launch game');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <h1 className="text-2xl font-bold">Session Lobby</h1>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="text-center">
            <p className="text-gray-400 mb-2">Join Code</p>
            <div
              className="text-6xl font-mono font-bold tracking-[0.3em] bg-gray-800 rounded-xl py-6 cursor-pointer hover:bg-gray-750"
              onClick={() => navigator.clipboard.writeText(joinCode)}
              title="Click to copy"
            >
              {joinCode}
            </div>
            <p className="text-gray-500 text-sm mt-2">Click to copy</p>

            {qrDataUrl && (
              <div className="mt-4 flex justify-center">
                <img src={qrDataUrl} alt="QR Code" className="rounded-lg" />
              </div>
            )}

            <p className="text-gray-400 mt-2 text-sm">
              Join at: {APP_URL}/join/{joinCode}
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">
              Players ({players.length}/50)
            </h3>

            <div className="bg-gray-800 rounded-xl p-4 min-h-[200px] max-h-[400px] overflow-y-auto">
              {players.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Waiting for players to join...</p>
              ) : (
                <div className="space-y-2">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg">
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={launchGame}
              disabled={players.length === 0 || loading}
              className="w-full mt-4 py-4 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xl font-bold rounded-xl transition-colors"
            >
              {loading ? 'Launching...' : 'Launch Game'}
            </button>

            {players.length === 0 && (
              <p className="text-yellow-400 text-sm text-center mt-2">
                Need at least 1 player to launch
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
