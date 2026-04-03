import { useRef, useEffect, useState, useCallback } from 'react';
import { GameChannel } from './client';

type MessageHandler = (message: any) => void;

export function useGameChannel(sessionId: string | null) {
  const channelRef = useRef<GameChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const handlersRef = useRef(new Set<MessageHandler>());

  useEffect(() => {
    if (!sessionId) return;

    const channel = new GameChannel(sessionId);
    channelRef.current = channel;

    // Register any existing handlers
    const unsubscribes: (() => void)[] = [];
    handlersRef.current.forEach((h) => {
      unsubscribes.push(channel.onMessage(h));
    });

    channel.connect();

    const checkInterval = setInterval(() => {
      setIsConnected(channel.isConnected);
    }, 500);

    return () => {
      clearInterval(checkInterval);
      unsubscribes.forEach((u) => u());
      channel.disconnect();
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [sessionId]);

  const onMessage = useCallback((handler: MessageHandler): (() => void) => {
    handlersRef.current.add(handler);
    const unsubFromChannel = channelRef.current?.onMessage(handler);
    return () => {
      handlersRef.current.delete(handler);
      unsubFromChannel?.();
    };
  }, []);

  const trackPosition = useCallback((playerId: string, positionX: number) => {
    channelRef.current?.trackPosition(playerId, positionX);
  }, []);

  return { onMessage, trackPosition, isConnected };
}
