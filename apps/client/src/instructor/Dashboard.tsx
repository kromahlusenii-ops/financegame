import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken, getAuthHeaders, signOut } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface Lesson {
  id: string;
  title: string;
  timer_seconds: number;
  created_at: string;
  checkpoint_count: number;
}

interface Session {
  id: string;
  join_code: string;
  status: string;
  created_at: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      navigate('/instructor/login');
      return;
    }
    loadData();
  }, []);

  async function loadData() {
    try {
      const headers = getAuthHeaders();

      const [lessonsRes, sessionsRes] = await Promise.all([
        fetch(`${API_BASE}/api/lessons`, { headers }),
        fetch(`${API_BASE}/api/sessions`, { headers }),
      ]);

      if (lessonsRes.status === 401 || sessionsRes.status === 401) {
        signOut();
        navigate('/instructor/login');
        return;
      }

      if (lessonsRes.ok) {
        const data = await lessonsRes.json();
        setLessons((data || []).map((l: any) => ({
          ...l,
          checkpoint_count: l.checkpoints?.[0]?.count ?? l.checkpoint_count ?? 0,
        })));
      }
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
    } catch {
      // Handle error silently
    } finally {
      setLoading(false);
    }
  }

  async function createLesson() {
    try {
      const res = await fetch(`${API_BASE}/api/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ title: 'New Lesson', timer_seconds: 15 }),
      });

      if (res.status === 401) {
        signOut();
        navigate('/instructor/login');
        return;
      }

      if (res.ok) {
        const lesson = await res.json();
        navigate(`/instructor/lessons/${lesson.id}`);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create lesson');
      }
    } catch {
      alert('Network error — please try again');
    }
  }

  async function createSession(lessonId: string) {
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ lesson_id: lessonId }),
      });

      if (res.status === 401) {
        signOut();
        navigate('/instructor/login');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        navigate(`/instructor/sessions/${data.sessionId}/lobby`);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create session');
      }
    } catch {
      alert('Network error — please try again');
    }
  }

  function handleLogout() {
    signOut();
    navigate('/instructor/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white text-xl">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Instructor Dashboard</h1>
        <button onClick={handleLogout} className="text-gray-400 hover:text-white text-sm">
          Sign Out
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-8">
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Lessons</h2>
            <button
              onClick={createLesson}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg font-medium transition-colors"
            >
              Create Lesson
            </button>
          </div>

          {lessons.length === 0 ? (
            <p className="text-gray-400">No lessons yet. Create one to get started.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {lessons.map(lesson => (
                <div key={lesson.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <h3 className="font-semibold text-lg mb-1">{lesson.title}</h3>
                  <p className="text-gray-400 text-sm mb-3">
                    {lesson.checkpoint_count || 0} checkpoints | {lesson.timer_seconds}s timer
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/instructor/lessons/${lesson.id}`)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => createSession(lesson.id)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                    >
                      Start Session
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Past Sessions</h2>
          {sessions.length === 0 ? (
            <p className="text-gray-400">No sessions yet.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => (
                <div
                  key={s.id}
                  className="bg-gray-800 rounded-lg p-4 flex justify-between items-center border border-gray-700 cursor-pointer hover:border-gray-500"
                  onClick={() => navigate(`/instructor/sessions/${s.id}/results`)}
                >
                  <div>
                    <p className="font-medium">Code: {s.join_code}</p>
                    <p className="text-gray-400 text-sm">
                      {new Date(s.created_at).toLocaleDateString()} | Status: {s.status}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    s.status === 'ended' ? 'bg-gray-600' : 'bg-green-600'
                  }`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
