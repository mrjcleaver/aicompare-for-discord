'use client';

import React from 'react';
import { useAuth, useUI } from '@/lib/store';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isAuthenticated } = useAuth();
  const { sidebarCollapsed, theme } = useUI();

  if (!isAuthenticated) {
    return (
      <div className={cn('min-h-screen bg-gray-50', theme === 'dark' && 'dark')}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen bg-gray-50 dark:bg-gray-900', theme === 'dark' && 'dark')}>
      <Header />
      <div className="flex">
        <Sidebar />
        <main
          className={cn(
            'flex-1 transition-all duration-300 ease-in-out',
            'pt-16', // Header height
            sidebarCollapsed ? 'ml-16' : 'ml-64'
          )}
        >
          <div className="p-4 lg:p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}