'use client';

import { useEffect } from 'react';
import { useAuth as useAuthStore, useCreateNotification } from '@/lib/store';
import { apiClient } from '@/lib/api-client';
import { createWebSocketManager, disconnectWebSocket } from '@/lib/websocket';

export function useAuth() {
  const authStore = useAuthStore();
  const { notifyError, notifySuccess } = useCreateNotification();

  // Initialize authentication on app start
  useEffect(() => {
    const initAuth = async () => {
      try {
        authStore.setLoading(true);
        
        // Check if there's a stored token
        const token = localStorage.getItem('auth-token');
        if (!token) {
          authStore.setLoading(false);
          return;
        }

        // Verify token with API
        apiClient.setAuthToken(token);
        const user = await apiClient.getCurrentUser();
        
        // Set user in store
        authStore.setUser(user);
        
        // Initialize WebSocket connection
        createWebSocketManager(token);
        
        notifySuccess('Welcome back!', `Hello ${user.username}`);
      } catch (error) {
        console.error('Auth initialization failed:', error);
        // Clear invalid token
        localStorage.removeItem('auth-token');
        apiClient.clearAuthToken();
        authStore.setLoading(false);
      }
    };

    initAuth();
  }, [authStore, notifyError, notifySuccess]);

  const login = async (token: string) => {
    try {
      authStore.setLoading(true);
      
      // Set token in API client
      apiClient.setAuthToken(token);
      
      // Fetch user data
      const user = await apiClient.getCurrentUser();
      
      // Store in localStorage
      localStorage.setItem('auth-token', token);
      localStorage.setItem('user-data', JSON.stringify(user));
      
      // Set user in store
      authStore.setUser(user);
      
      // Initialize WebSocket
      createWebSocketManager(token);
      
      notifySuccess('Login successful', `Welcome ${user.username}!`);
      
      return user;
    } catch (error) {
      authStore.setLoading(false);
      notifyError('Login failed', 'Please try again.');
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Call API logout endpoint
      await apiClient.logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with logout even if API call fails
    } finally {
      // Disconnect WebSocket
      disconnectWebSocket();
      
      // Clear local storage
      localStorage.removeItem('auth-token');
      localStorage.removeItem('user-data');
      
      // Clear API client token
      apiClient.clearAuthToken();
      
      // Clear store
      authStore.logout();
      
      // Redirect to login
      window.location.href = '/auth/login';
    }
  };

  const refreshToken = async () => {
    try {
      const newToken = await apiClient.refreshToken();
      localStorage.setItem('auth-token', newToken);
      return newToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      await logout();
      throw error;
    }
  };

  return {
    ...authStore,
    login,
    logout,
    refreshToken
  };
}

// Hook for protected routes
export function useRequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = '/auth/login';
    }
  }, [isAuthenticated, isLoading]);

  return { isAuthenticated, isLoading };
}