import { useLocation, useSearchParams } from 'react-router-dom';
import PhaserGame from '../game/PhaserGame';

interface GameState {
  playerId: string;
  sessionId: string;
  totalCheckpoints: number;
  role: 'student' | 'instructor';
}

export default function Game() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const state = location.state as GameState | null;
  const role = searchParams.get('role') as 'student' | 'instructor' || state?.role || 'student';

  return (
    <div className={`${role === 'student' ? 'h-screen' : ''} bg-black`}>
      <PhaserGame
        role={role}
        playerId={state?.playerId || ''}
        sessionId={state?.sessionId || ''}
      />
    </div>
  );
}
