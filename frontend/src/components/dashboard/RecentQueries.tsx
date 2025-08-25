'use client';

import React from 'react';
import { formatRelativeTime, getModelEmoji, getModelName, truncateText, cn } from '@/lib/utils';
import { 
  ClockIcon, 
  CheckCircleIcon, 
  ExclamationCircleIcon,
  PlayCircleIcon
} from '@heroicons/react/24/outline';

interface RecentQuery {
  id: string;
  type: 'comparison';
  prompt: string;
  timestamp: string;
  models: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface RecentQueriesProps {
  queries: RecentQuery[];
}

export function RecentQueries({ queries }: RecentQueriesProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <PlayCircleIcon className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <ExclamationCircleIcon className="h-4 w-4 text-red-500" />;
      default:
        return <ClockIcon className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'processing':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'failed':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  if (queries.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Recent Activity
        </h3>
        <div className="text-center py-8">
          <div className="text-gray-400 dark:text-gray-500 text-4xl mb-2">🤖</div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No recent comparisons yet. Start by running your first AI model comparison!
          </p>
          <button className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">
            Start Comparison
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Recent Activity
        </h3>
        <a
          href="/history"
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          View all →
        </a>
      </div>

      <div className="space-y-3">
        {queries.map((query) => (
          <div
            key={query.id}
            className="flex items-start space-x-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-colors cursor-pointer"
          >
            {/* Status icon */}
            <div className="flex-shrink-0 mt-1">
              {getStatusIcon(query.status)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {truncateText(query.prompt, 60)}
                </p>
                <span className={cn(
                  'ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
                  getStatusColor(query.status)
                )}>
                  {query.status}
                </span>
              </div>

              {/* Models used */}
              <div className="flex items-center space-x-1 mb-2">
                {query.models.slice(0, 4).map((modelId) => (
                  <span
                    key={modelId}
                    className="text-sm"
                    title={getModelName(modelId)}
                  >
                    {getModelEmoji(modelId)}
                  </span>
                ))}
                {query.models.length > 4 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    +{query.models.length - 4} more
                  </span>
                )}
              </div>

              {/* Timestamp and metrics */}
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center">
                  <ClockIcon className="h-3 w-3 mr-1" />
                  {formatRelativeTime(query.timestamp)}
                </span>
                <span>
                  {query.models.length} model{query.models.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex-shrink-0 flex items-center space-x-1">
              <button
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                title="View comparison"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
              
              {query.status === 'failed' && (
                <button
                  className="p-1 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
                  title="Retry comparison"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Quick stats */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {queries.filter(q => q.status === 'completed').length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Completed</div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {queries.filter(q => q.status === 'processing').length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Processing</div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {queries.filter(q => q.status === 'failed').length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Failed</div>
          </div>
        </div>
      </div>
    </div>
  );
}