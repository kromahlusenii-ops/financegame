import express from 'express';
import http from 'http';
import { SessionManager } from './ws/session.js';
import { createWebSocketServer } from './ws/server.js';
import { authRouter } from './api/auth.js';
import { lessonsRouter } from './api/lessons.js';
import { createSessionsRouter } from './api/sessions.js';
import { supabase } from './lib/supabase.js';

const app = express();
const server = http.createServer(app);
const sessionManager = new SessionManager();

app.use(express.json());

// CORS for development
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.VITE_APP_URL || 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/lessons', lessonsRouter);

const sessionsRouter = createSessionsRouter(sessionManager);
app.use('/api/sessions', sessionsRouter);

// Public join route
app.get('/api/join/:code', async (req, res) => {
  const session = sessionManager.getSessionByCode(req.params.code.toUpperCase());
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { data: lesson } = await supabase
    .from('lessons')
    .select('title')
    .eq('id', session.lessonId)
    .single();

  res.json({
    sessionId: session.sessionId,
    lessonTitle: lesson?.title || 'Unknown',
    playerCount: session.players.size,
    status: session.status,
  });
});

// WebSocket
createWebSocketServer(server, sessionManager);

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, server, sessionManager };
