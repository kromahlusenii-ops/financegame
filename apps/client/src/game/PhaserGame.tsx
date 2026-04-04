import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from './config';
import BootScene from './scenes/BootScene';
import LobbyScene from './scenes/LobbyScene';
import RunnerScene from './scenes/RunnerScene';
import CheckpointOverlayScene from './scenes/CheckpointOverlayScene';
import SpectatorScene from './scenes/SpectatorScene';
import LeaderboardScene from './scenes/LeaderboardScene';
import { useSessionPolling } from '../ws/useSessionPolling';

interface PhaserGameProps {
  role: 'student' | 'instructor';
  playerId: string;
  sessionId: string;
}

export default function PhaserGame({ role, playerId, sessionId }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const { onMessage, trackPosition, state } = useSessionPolling(sessionId);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config = createGameConfig(
      containerRef.current,
      [BootScene, LobbyScene, RunnerScene, CheckpointOverlayScene, SpectatorScene, LeaderboardScene],
      role
    );

    const game = new Phaser.Game(config);
    gameRef.current = game;

    game.registry.set('playerId', playerId);
    game.registry.set('sessionId', sessionId);
    game.registry.set('role', role);
    game.registry.set('onMessage', onMessage);
    game.registry.set('trackPosition', trackPosition);
    game.registry.set('wsConnected', true);

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Push session state into the Phaser registry whenever it changes
  useEffect(() => {
    if (gameRef.current && state) {
      gameRef.current.registry.set('sessionState', state);
    }
  }, [state]);

  return (
    <div
      ref={containerRef}
      style={{ height: role === 'student' ? '100vh' : '400px' }}
    />
  );
}
