import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAuthHeaders } from '../lib/supabase';
import { useSessionPolling } from '../ws/useSessionPolling';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function SessionLive() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { onMessage, state: sessionState } = useSessionPolling(id || null);

  const [playersAlive, setPlayersAlive] = useState(0);
  const [currentCheckpoint, setCurrentCheckpoint] = useState(-1);
  const [totalCheckpoints, setTotalCheckpoints] = useState(0);
  const [isCheckpointActive, setIsCheckpointActive] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalAlive, setTotalAlive] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [distribution, setDistribution] = useState<Record<number, number>>({});
  const [eliminations, setEliminations] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [startTime] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Direct state reads from polling (continuous updates)
  useEffect(() => {
    if (!sessionState) return;
    setPlayersAlive(sessionState.players.filter((p) => p.status === 'alive').length);
    setTotalCheckpoints(sessionState.session.totalCheckpoints);
    if (sessionState.checkpoint) {
      setAnsweredCount(sessionState.checkpoint.answeredCount);
      setTotalAlive(sessionState.checkpoint.totalAlive);
    }
  }, [sessionState]);

  // Transition events from polling
  useEffect(() => {
    const unsub = onMessage((msg: any) => {
      switch (msg.type) {
        case 'game_launched':
          setTotalCheckpoints(msg.totalCheckpoints);
          break;
        case 'checkpoint_start':
          setCurrentCheckpoint(msg.checkpointIndex);
          setIsCheckpointActive(true);
          setShowResults(false);
          setAnsweredCount(0);
          setSecondsRemaining(msg.timerSeconds);
          startTimer(msg.timerSeconds);
          break;
        case 'checkpoint_answers_live':
          setAnsweredCount(msg.answeredCount);
          setTotalAlive(msg.totalAlive);
          break;
        case 'checkpoint_results':
          setIsCheckpointActive(false);
          setShowResults(true);
          setDistribution(msg.answerDistribution);
          setEliminations(msg.eliminations || []);
          setLeaderboard(msg.leaderboard || []);
          stopTimer();
          break;
        case 'session_ended':
          navigate(`/instructor/sessions/${id}/results`);
          break;
      }
    });
    return () => {
      unsub();
      stopTimer();
    };
  }, [onMessage, id, navigate]);

  function startTimer(seconds: number) {
    stopTimer();
    let remaining = seconds;
    timerRef.current = setInterval(() => {
      remaining--;
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        stopTimer();
        resolveCheckpoint();
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function resolveCheckpoint() {
    try {
      await fetch(`${API_BASE}/api/sessions/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
    } catch {
      // Resolve failed
    }
  }

  async function fireCheckpoint() {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/sessions/${id}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }

  async function endGame() {
    if (!confirm('End the game now?')) return;
    try {
      await fetch(`${API_BASE}/api/sessions/${id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
    } catch {
      // Handle error
    }
  }

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex gap-6 text-sm">
          <span>Players Alive: <strong>{playersAlive}</strong></span>
          <span>Checkpoint: <strong>{currentCheckpoint + 1}/{totalCheckpoints}</strong></span>
          <span>Time: <strong>{minutes}:{seconds.toString().padStart(2, '0')}</strong></span>
        </div>
        <button
          onClick={endGame}
          className="px-4 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
        >
          End Game
        </button>
      </div>

      <div className="bg-gray-950 h-[400px] flex items-center justify-center border-b border-gray-700">
        <p className="text-gray-600 text-lg">Game Runner Canvas</p>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {!isCheckpointActive && !showResults && (
          <button
            onClick={fireCheckpoint}
            disabled={loading || currentCheckpoint >= totalCheckpoints - 1}
            className="w-full py-6 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-2xl font-bold rounded-xl transition-colors mb-6"
          >
            {loading ? 'Firing...' : currentCheckpoint >= totalCheckpoints - 1
              ? 'All Checkpoints Complete'
              : 'Fire Checkpoint'}
          </button>
        )}

        {isCheckpointActive && (
          <div className="bg-gray-800 rounded-xl p-6 mb-6 text-center">
            <div className="text-4xl font-bold text-orange-400 mb-2">{secondsRemaining}s</div>
            <p className="text-gray-400">
              {answeredCount}/{totalAlive} answered
            </p>
            <div className="mt-3 bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-full transition-all duration-300"
                style={{ width: totalAlive > 0 ? `${(answeredCount / totalAlive) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}

        {showResults && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">Answer Distribution</h3>
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => {
                  const count = distribution[i] || 0;
                  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-6 font-mono">{String.fromCharCode(65 + i)}</span>
                      <div className="flex-1 bg-gray-700 rounded-full h-6 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {eliminations.length > 0 && (
              <div className="bg-red-900/30 border border-red-700 rounded-xl p-4">
                <h3 className="font-semibold text-red-300 mb-2">Eliminated</h3>
                <div className="flex flex-wrap gap-2">
                  {eliminations.map((e: any) => (
                    <span key={e.playerId || e} className="px-2 py-1 bg-red-800 rounded text-sm">
                      {e.displayName || e}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-semibold mb-3">Top 5</h3>
              {leaderboard.slice(0, 5).map((entry: any) => (
                <div key={entry.rank} className="flex justify-between py-1">
                  <span>#{entry.rank} {entry.displayName}</span>
                  <span className="font-mono">{entry.score} pts</span>
                </div>
              ))}
            </div>

            <button
              onClick={currentCheckpoint >= totalCheckpoints - 1 ? endGame : fireCheckpoint}
              className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl"
            >
              {currentCheckpoint >= totalCheckpoints - 1 ? 'End Game' : 'Resume & Continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
