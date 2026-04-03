import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Join from './pages/Join';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import Login from './instructor/Login';
import Dashboard from './instructor/Dashboard';
import LessonBuilder from './instructor/LessonBuilder';
import SessionLobby from './instructor/SessionLobby';
import SessionLive from './instructor/SessionLive';
import SessionHistory from './instructor/SessionHistory';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join" element={<Join />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/game" element={<Game />} />
        <Route path="/instructor/login" element={<Login />} />
        <Route path="/instructor" element={<Dashboard />} />
        <Route path="/instructor/lessons/:id" element={<LessonBuilder />} />
        <Route path="/instructor/sessions/:id/lobby" element={<SessionLobby />} />
        <Route path="/instructor/sessions/:id/live" element={<SessionLive />} />
        <Route path="/instructor/sessions/:id/results" element={<SessionHistory />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
