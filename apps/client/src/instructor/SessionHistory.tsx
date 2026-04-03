import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getToken, getAuthHeaders } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface CheckpointResult {
  id: string;
  checkpoint_id: string;
  answer_distribution: Record<number, number>;
  total_answered: number;
  total_correct: number;
  question: string;
  options: string[];
  correct_index: number;
}

export default function SessionHistory() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<CheckpointResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      navigate('/instructor/login');
      return;
    }
    loadResults();
  }, [id]);

  async function loadResults() {
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${id}/results`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white">Loading results...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
        <button onClick={() => navigate('/instructor')} className="text-gray-400 hover:text-white">
          &larr; Back to Dashboard
        </button>
        <h1 className="text-xl font-bold">Session Results</h1>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {results.length === 0 ? (
          <p className="text-gray-400 text-center py-12">No results available for this session.</p>
        ) : (
          results.map((r, index) => (
            <div key={r.id} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="font-semibold mb-1">Checkpoint #{index + 1}</h3>
              <p className="text-gray-300 mb-4">{r.question}</p>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-700 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{r.total_answered}</p>
                  <p className="text-gray-400 text-sm">Total Answered</p>
                </div>
                <div className="bg-gray-700 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-400">
                    {r.total_answered > 0
                      ? Math.round((r.total_correct / r.total_answered) * 100)
                      : 0}%
                  </p>
                  <p className="text-gray-400 text-sm">Correct</p>
                </div>
              </div>

              <div className="space-y-2">
                {r.options?.map((opt: string, i: number) => {
                  const count = r.answer_distribution[i] || 0;
                  const pct = r.total_answered > 0 ? (count / r.total_answered) * 100 : 0;
                  const isCorrect = i === r.correct_index;

                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`w-6 font-mono ${isCorrect ? 'text-green-400' : ''}`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <div className="flex-1 bg-gray-700 rounded-full h-5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isCorrect ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-sm text-gray-400">
                        {count} ({Math.round(pct)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
