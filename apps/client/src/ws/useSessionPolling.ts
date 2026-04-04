import { useRef, useEffect, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL = 1500;

type MessageHandler = (message: any) => void;

export interface SessionState {
  session: {
    id: string;
    status: 'lobby' | 'running' | 'checkpoint_active' | 'ended';
    currentCheckpointIndex: number;
    checkpointStartedAt: string | null;
    timerSeconds: number;
    totalCheckpoints: number;
  };
  players: Array<{
    id: string;
    displayName: string;
    score: number;
    lives: number;
    status: string;
    totalTimeMs: number;
  }>;
  checkpoint?: {
    question: string;
    options: string[];
    timerSeconds: number;
    checkpointIndex: number;
    answeredCount: number;
    totalAlive: number;
  };
  results?: {
    correctIndex: number;
    fact: string;
    answerDistribution: Record<number, number>;
    eliminations: Array<{ playerId: string; displayName: string }>;
    leaderboard: any[];
  };
  finalLeaderboard?: any[];
}

function detectTransitions(prev: SessionState | null, next: SessionState): any[] {
  const messages: any[] = [];
  const nextStatus = next.session.status;

  // First poll — no synthetic events. Scenes self-initialize from state in the registry.
  if (!prev) {
    return messages;
  }

  const prevStatus = prev.session.status;

  // lobby → running: game_launched
  if (prevStatus === 'lobby' && (nextStatus === 'running' || nextStatus === 'checkpoint_active')) {
    messages.push({
      type: 'game_launched',
      totalCheckpoints: next.session.totalCheckpoints,
    });
  }

  // → checkpoint_active: checkpoint_start
  if (prevStatus !== 'checkpoint_active' && nextStatus === 'checkpoint_active' && next.checkpoint) {
    messages.push({
      type: 'checkpoint_start',
      checkpointIndex: next.checkpoint.checkpointIndex,
      question: next.checkpoint.question,
      options: next.checkpoint.options,
      timerSeconds: next.checkpoint.timerSeconds,
    });
  }

  // During checkpoint_active: answer count changed
  if (nextStatus === 'checkpoint_active' && next.checkpoint) {
    const prevCount = prev.checkpoint?.answeredCount ?? -1;
    if (next.checkpoint.answeredCount !== prevCount) {
      messages.push({
        type: 'checkpoint_answers_live',
        answeredCount: next.checkpoint.answeredCount,
        totalAlive: next.checkpoint.totalAlive,
      });
    }
  }

  // checkpoint_active → running: checkpoint_results
  if (prevStatus === 'checkpoint_active' && nextStatus === 'running' && next.results) {
    messages.push({
      type: 'checkpoint_results',
      correctIndex: next.results.correctIndex,
      fact: next.results.fact,
      answerDistribution: next.results.answerDistribution,
      eliminations: next.results.eliminations,
      leaderboard: next.results.leaderboard,
    });
  }

  // Checkpoint index advanced while status stayed running (missed rapid transition)
  if (
    prevStatus === 'running' &&
    nextStatus === 'running' &&
    next.session.currentCheckpointIndex > prev.session.currentCheckpointIndex &&
    next.results
  ) {
    messages.push({
      type: 'checkpoint_results',
      correctIndex: next.results.correctIndex,
      fact: next.results.fact,
      answerDistribution: next.results.answerDistribution,
      eliminations: next.results.eliminations,
      leaderboard: next.results.leaderboard,
    });
  }

  // → ended: session_ended
  if (prevStatus !== 'ended' && nextStatus === 'ended') {
    messages.push({
      type: 'session_ended',
      finalLeaderboard: next.finalLeaderboard,
    });
  }

  return messages;
}

export function useSessionPolling(sessionId: string | null) {
  const [state, setState] = useState<SessionState | null>(null);
  const prevStateRef = useRef<SessionState | null>(null);
  const handlersRef = useRef(new Set<MessageHandler>());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fireMessages = useCallback((messages: any[]) => {
    for (const msg of messages) {
      handlersRef.current.forEach((h) => h(msg));
    }
  }, []);

  const poll = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/state`);
      if (!res.ok) return;
      const next: SessionState = await res.json();

      const messages = detectTransitions(prevStateRef.current, next);
      prevStateRef.current = next;
      setState(next);

      if (messages.length > 0) {
        fireMessages(messages);
      }
    } catch {
      // Network error, retry on next interval
    }
  }, [sessionId, fireMessages]);

  useEffect(() => {
    if (!sessionId) return;

    // Reset state for new session
    prevStateRef.current = null;
    setState(null);

    // Poll immediately
    poll();

    // Then poll on interval
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, poll]);

  const onMessage = useCallback((handler: MessageHandler): (() => void) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const trackPosition = useCallback((_playerId: string, _positionX: number) => {
    // No-op — ghost players disabled in polling mode
  }, []);

  return { onMessage, trackPosition, isConnected: !!state, state };
}
