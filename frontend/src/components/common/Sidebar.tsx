'use client';

import React from 'react';
import { useUI, useComparisons } from '@/lib/store';
import { 
  HomeIcon, 
  ChartBarIcon, 
  Cog6ToothIcon,
  ClockIcon,
  BeakerIcon
} from '@heroicons/react/24/outline';
import { 
  HomeIcon as HomeIconSolid, 
  ChartBarIcon as ChartBarIconSolid, 
  Cog6ToothIcon as Cog6ToothIconSolid,
  ClockIcon as ClockIconSolid,
  BeakerIcon as BeakerIconSolid
} from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  activeIcon: React.ComponentType<{ className?: string }>;
  current: boolean;
  count?: number;
}

export function Sidebar() {
  const { sidebarCollapsed, currentView, setCurrentView } = useUI();
  const { comparisons } = useComparisons();
  
  const recentComparisons = comparisons.slice(0, 5);

  const navigation: NavItem[] = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: HomeIcon,
      activeIcon: HomeIconSolid,
      current: currentView === 'dashboard'
    },
    {
      name: 'Analytics',
      href: '/analytics',
      icon: ChartBarIcon,
      activeIcon: ChartBarIconSolid,
      current: false
    },
    {
      name: 'History',
      href: '/history',
      icon: ClockIcon,
      activeIcon: ClockIconSolid,
      current: false,
      count: comparisons.length
    },
    {
      name: 'Test Models',
      href: '/test',
      icon: BeakerIcon,
      activeIcon: BeakerIconSolid,
      current: false
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Cog6ToothIcon,
      activeIcon: Cog6ToothIconSolid,
      current: currentView === 'settings'
    }
  ];

  return (
    <div
      className={cn(
        'fixed left-0 top-16 h-[calc(100vh-4rem)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out z-40',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex flex-col h-full">
        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navigation.map((item) => {
            const Icon = item.current ? item.activeIcon : item.icon;
            
            return (
              <a
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  item.current
                    ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                )}
                title={sidebarCollapsed ? item.name : undefined}
              >
                <Icon
                  className={cn(
                    'flex-shrink-0 h-5 w-5',
                    item.current
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                  )}
                />
                {!sidebarCollapsed && (
                  <>
                    <span className="ml-3 flex-1">{item.name}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                        {item.count}
                      </span>
                    )}
                  </>
                )}
              </a>
            );
          })}
        </nav>

        {/* Recent Comparisons */}
        {!sidebarCollapsed && recentComparisons.length > 0 && (
          <div className="px-2 py-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="px-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Recent Comparisons
            </h3>
            <div className="mt-2 space-y-1">
              {recentComparisons.map((comparison) => (
                <a
                  key={comparison.id}
                  href={`/comparison/${comparison.id}`}
                  className="group flex items-center px-2 py-2 text-xs font-medium rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
                  title={comparison.prompt}
                >
                  <div className="flex-1 truncate">
                    <div className="truncate">{comparison.prompt}</div>
                    <div className="text-gray-400 dark:text-gray-500 text-xs">
                      {comparison.responses.length} models
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={cn('px-2 py-4 border-t border-gray-200 dark:border-gray-700', sidebarCollapsed && 'px-3')}>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {sidebarCollapsed ? (
              <div className="text-center">v1.0</div>
            ) : (
              <>
                <div>AI Compare v1.0</div>
                <div className="mt-1">Built with Next.js</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}