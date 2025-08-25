import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/api';
import type { Comparison } from '@/types/comparison';
import type { UserSettings } from '@/types/user';

interface AppState {
  // Auth state
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Comparison state
  activeComparison: Comparison | null;
  comparisons: Comparison[];
  
  // UI state
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark';
  currentView: 'dashboard' | 'comparison' | 'settings';
  
  // Notification state
  notifications: Notification[];
  
  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setActiveComparison: (comparison: Comparison | null) => void;
  addComparison: (comparison: Comparison) => void;
  updateComparison: (id: string, updates: Partial<Comparison>) => void;
  removeComparison: (id: string) => void;
  setComparisons: (comparisons: Comparison[]) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setCurrentView: (view: 'dashboard' | 'comparison' | 'settings') => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  logout: () => void;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: false,
      activeComparison: null,
      comparisons: [],
      sidebarCollapsed: false,
      theme: 'light',
      currentView: 'dashboard',
      notifications: [],
      
      // Actions
      setUser: (user) => set({ 
        user, 
        isAuthenticated: !!user,
        isLoading: false 
      }),
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      setActiveComparison: (comparison) => set({ 
        activeComparison: comparison,
        currentView: comparison ? 'comparison' : 'dashboard'
      }),
      
      addComparison: (comparison) => set((state) => ({
        comparisons: [comparison, ...state.comparisons]
      })),
      
      updateComparison: (id, updates) => set((state) => {
        const updatedComparisons = state.comparisons.map(c => 
          c.id === id ? { ...c, ...updates } : c
        );
        
        return {
          comparisons: updatedComparisons,
          activeComparison: state.activeComparison?.id === id 
            ? { ...state.activeComparison, ...updates } 
            : state.activeComparison
        };
      }),
      
      removeComparison: (id) => set((state) => ({
        comparisons: state.comparisons.filter(c => c.id !== id),
        activeComparison: state.activeComparison?.id === id 
          ? null 
          : state.activeComparison
      })),
      
      setComparisons: (comparisons) => set({ comparisons }),
      
      toggleSidebar: () => set((state) => ({ 
        sidebarCollapsed: !state.sidebarCollapsed 
      })),
      
      setSidebarCollapsed: (collapsed) => set({ 
        sidebarCollapsed: collapsed 
      }),
      
      setTheme: (theme) => set({ theme }),
      
      setCurrentView: (view) => set({ currentView: view }),
      
      addNotification: (notification) => set((state) => ({
        notifications: [notification, ...state.notifications]
      })),
      
      removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      })),
      
      clearNotifications: () => set({ notifications: [] }),
      
      logout: () => set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        activeComparison: null,
        comparisons: [],
        notifications: [],
        currentView: 'dashboard'
      })
    }),
    {
      name: 'aicompare-storage',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        // Only persist non-sensitive UI state
      })
    }
  )
);

// Selectors for better performance
export const useAuth = () => useStore((state) => ({
  user: state.user,
  isAuthenticated: state.isAuthenticated,
  isLoading: state.isLoading,
  setUser: state.setUser,
  setLoading: state.setLoading,
  logout: state.logout
}));

export const useComparisons = () => useStore((state) => ({
  comparisons: state.comparisons,
  activeComparison: state.activeComparison,
  setActiveComparison: state.setActiveComparison,
  addComparison: state.addComparison,
  updateComparison: state.updateComparison,
  removeComparison: state.removeComparison,
  setComparisons: state.setComparisons
}));

export const useUI = () => useStore((state) => ({
  sidebarCollapsed: state.sidebarCollapsed,
  theme: state.theme,
  currentView: state.currentView,
  toggleSidebar: state.toggleSidebar,
  setSidebarCollapsed: state.setSidebarCollapsed,
  setTheme: state.setTheme,
  setCurrentView: state.setCurrentView
}));

export const useNotifications = () => useStore((state) => ({
  notifications: state.notifications,
  addNotification: state.addNotification,
  removeNotification: state.removeNotification,
  clearNotifications: state.clearNotifications
}));

// Utility hooks
export const useCreateNotification = () => {
  const { addNotification } = useNotifications();
  
  return {
    notifySuccess: (title: string, message: string) => addNotification({
      id: Date.now().toString(),
      type: 'success',
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false
    }),
    
    notifyError: (title: string, message: string) => addNotification({
      id: Date.now().toString(),
      type: 'error',
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false
    }),
    
    notifyWarning: (title: string, message: string) => addNotification({
      id: Date.now().toString(),
      type: 'warning',
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false
    }),
    
    notifyInfo: (title: string, message: string) => addNotification({
      id: Date.now().toString(),
      type: 'info',
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false
    })
  };
};