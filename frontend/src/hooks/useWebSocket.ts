'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAuth, useComparisons, useCreateNotification } from '@/lib/store';
import { getWebSocketManager } from '@/lib/websocket';
import type { WebSocketMessage } from '@/types/comparison';

export function useWebSocket() {
  const { user, isAuthenticated } = useAuth();
  const { updateComparison, addComparison } = useComparisons();
  const { notifyInfo, notifySuccess } = useCreateNotification();
  const wsManagerRef = useRef(getWebSocketManager());

  // Handle incoming WebSocket messages
  const handleComparisonUpdate = useCallback((data: any) => {
    updateComparison(data.id, data);
    
    if (data.status === 'completed') {
      notifySuccess(
        'Comparison completed',
        `Your comparison "${data.prompt.substring(0, 50)}..." is ready!`
      );
    }
  }, [updateComparison, notifySuccess]);

  const handleVoteUpdate = useCallback((data: any) => {
    updateComparison(data.comparisonId, {
      responses: data.responses,
      votes: data.votes
    });
  }, [updateComparison]);

  const handleNewComparison = useCallback((data: any) => {
    // Only add if it's from the current user or a shared comparison
    if (data.userId === user?.id || data.isShared) {
      addComparison(data);
      
      if (data.userId !== user?.id) {
        notifyInfo(
          'New comparison shared',
          `"${data.prompt.substring(0, 50)}..." from ${data.username}`
        );
      }
    }
  }, [addComparison, user?.id, notifyInfo]);

  const handleModelRating = useCallback((data: any) => {
    updateComparison(data.comparisonId, {
      responses: data.responses
    });
  }, [updateComparison]);

  const handleConnectionStatus = useCallback((data: any) => {
    if (data.status === 'connected') {
      console.log('WebSocket connected successfully');
    } else if (data.status === 'disconnected') {
      console.log('WebSocket disconnected');
    }
  }, []);

  // Set up WebSocket event listeners
  useEffect(() => {
    const wsManager = wsManagerRef.current;
    if (!wsManager || !isAuthenticated) return;

    // Set up event listeners
    wsManager.onComparisonUpdate(handleComparisonUpdate);
    wsManager.onVoteUpdate(handleVoteUpdate);
    wsManager.onNewComparison(handleNewComparison);
    wsManager.onModelRating(handleModelRating);
    wsManager.on('connection_status', handleConnectionStatus);

    // Cleanup function
    return () => {
      wsManager.offComparisonUpdate(handleComparisonUpdate);
      wsManager.offVoteUpdate(handleVoteUpdate);
      wsManager.offNewComparison(handleNewComparison);
      wsManager.offModelRating(handleModelRating);
      wsManager.off('connection_status', handleConnectionStatus);
    };
  }, [
    isAuthenticated,
    handleComparisonUpdate,
    handleVoteUpdate,
    handleNewComparison,
    handleModelRating,
    handleConnectionStatus
  ]);

  // Send WebSocket message
  const sendMessage = useCallback((type: string, data: any) => {
    const wsManager = wsManagerRef.current;
    if (wsManager && wsManager.isConnected()) {
      wsManager.send(type, data);
    } else {
      console.warn('WebSocket not connected, cannot send message:', { type, data });
    }
  }, []);

  // Subscribe to specific comparison updates
  const subscribeToComparison = useCallback((comparisonId: string) => {
    sendMessage('subscribe_comparison', { comparisonId });
  }, [sendMessage]);

  const unsubscribeFromComparison = useCallback((comparisonId: string) => {
    sendMessage('unsubscribe_comparison', { comparisonId });
  }, [sendMessage]);

  // Subscribe to guild updates
  const subscribeToGuild = useCallback((guildId: string) => {
    sendMessage('subscribe_guild', { guildId });
  }, [sendMessage]);

  const unsubscribeFromGuild = useCallback((guildId: string) => {
    sendMessage('unsubscribe_guild', { guildId });
  }, [sendMessage]);

  // Send typing indicator for live collaboration
  const sendTyping = useCallback((comparisonId: string, isTyping: boolean) => {
    sendMessage('typing', { comparisonId, isTyping });
  }, [sendMessage]);

  // Get connection status
  const isConnected = useCallback(() => {
    const wsManager = wsManagerRef.current;
    return wsManager ? wsManager.isConnected() : false;
  }, []);

  const getReadyState = useCallback(() => {
    const wsManager = wsManagerRef.current;
    return wsManager ? wsManager.getReadyState() : undefined;
  }, []);

  return {
    sendMessage,
    subscribeToComparison,
    unsubscribeFromComparison,
    subscribeToGuild,
    unsubscribeFromGuild,
    sendTyping,
    isConnected,
    getReadyState
  };
}

// Hook for managing comparison subscriptions
export function useComparisonSubscription(comparisonId: string | null) {
  const { subscribeToComparison, unsubscribeFromComparison, isConnected } = useWebSocket();
  const prevComparisonIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevComparisonIdRef.current;
    const currentId = comparisonId;

    // Unsubscribe from previous comparison
    if (prevId && prevId !== currentId && isConnected()) {
      unsubscribeFromComparison(prevId);
    }

    // Subscribe to current comparison
    if (currentId && currentId !== prevId && isConnected()) {
      subscribeToComparison(currentId);
    }

    prevComparisonIdRef.current = currentId;

    // Cleanup on unmount
    return () => {
      if (currentId && isConnected()) {
        unsubscribeFromComparison(currentId);
      }
    };
  }, [comparisonId, subscribeToComparison, unsubscribeFromComparison, isConnected]);
}

// Hook for guild-level subscriptions
export function useGuildSubscription(guildId: string | null) {
  const { subscribeToGuild, unsubscribeFromGuild, isConnected } = useWebSocket();
  const prevGuildIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevGuildIdRef.current;
    const currentId = guildId;

    if (prevId && prevId !== currentId && isConnected()) {
      unsubscribeFromGuild(prevId);
    }

    if (currentId && currentId !== prevId && isConnected()) {
      subscribeToGuild(currentId);
    }

    prevGuildIdRef.current = currentId;

    return () => {
      if (currentId && isConnected()) {
        unsubscribeFromGuild(currentId);
      }
    };
  }, [guildId, subscribeToGuild, unsubscribeFromGuild, isConnected]);
}

// Hook for live collaboration features
export function useCollaboration(comparisonId: string | null) {
  const { sendTyping } = useWebSocket();
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const indicateTyping = useCallback(() => {
    if (!comparisonId) return;

    sendTyping(comparisonId, true);

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(comparisonId, false);
    }, 3000);
  }, [comparisonId, sendTyping]);

  const stopTyping = useCallback(() => {
    if (!comparisonId) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    sendTyping(comparisonId, false);
  }, [comparisonId, sendTyping]);

  return {
    indicateTyping,
    stopTyping
  };
}