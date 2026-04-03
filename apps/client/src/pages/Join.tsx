import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function Join() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = code.length === 6 && name.trim().length > 0 && name.trim().length <= 20;

  async function handleJoin() {
    if (!isValid) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/join/${code.toUpperCase()}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Invalid code');
        return;
      }

      const data = await res.json();
      if (data.status !== 'lobby') {
        setError('This game has already started');
        return;
      }

      // Navigate to lobby with join info
      navigate('/lobby', {
        state: {
          joinCode: code.toUpperCase(),
          displayName: name.trim(),
          sessionId: data.sessionId,
          lessonTitle: data.lessonTitle,
        },
      });
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center px-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 w-full max-w-md">
        <h2 className="text-3xl font-bold text-white mb-6 text-center">Join Game</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-purple-200 text-sm mb-1">Game Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABCDEF"
              className="w-full px-4 py-3 rounded-lg bg-white/20 text-white text-center text-2xl font-mono tracking-widest placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-400"
              maxLength={6}
            />
          </div>

          <div>
            <label className="block text-purple-200 text-sm mb-1">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-400"
              maxLength={20}
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-400 text-red-200 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={!isValid || loading}
            className="w-full py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors text-lg"
          >
            {loading ? 'Joining...' : 'Join Game'}
          </button>
        </div>
      </div>
    </div>
  );
}
