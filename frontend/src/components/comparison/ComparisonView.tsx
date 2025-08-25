'use client';

import React, { useState, useMemo } from 'react';
import type { Comparison } from '@/types/comparison';
import { ResponseCard } from './ResponseCard';
import { SimilarityMetrics } from './SimilarityMetrics';
import { VotingInterface } from './VotingInterface';
import { cn, formatDate } from '@/lib/utils';
import { 
  ClockIcon, 
  ChatBubbleLeftRightIcon,
  ShareIcon,
  DocumentDuplicateIcon
} from '@heroicons/react/24/outline';

interface ComparisonViewProps {
  comparison: Comparison;
  className?: string;
}

export function ComparisonView({ comparison, className }: ComparisonViewProps) {
  const [selectedResponse, setSelectedResponse] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'votes' | 'speed' | 'length'>('votes');
  
  const sortedResponses = useMemo(() => {
    return [...comparison.responses].sort((a, b) => {
      switch (sortBy) {
        case 'votes':
          const aScore = (a.votes?.thumbsUp || 0) - (a.votes?.thumbsDown || 0);
          const bScore = (b.votes?.thumbsUp || 0) - (b.votes?.thumbsDown || 0);
          if (aScore !== bScore) return bScore - aScore;
          return a.responseTime - b.responseTime;
        case 'speed':
          return a.responseTime - b.responseTime;
        case 'length':
          return b.content.length - a.content.length;
        default:
          return 0;
      }
    });
  }, [comparison.responses, sortBy]);

  const gridColumns = useMemo(() => {
    const count = comparison.responses.length;
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  }, [comparison.responses.length]);

  const averageResponseTime = useMemo(() => {
    return Math.round(
      comparison.responses.reduce((sum, r) => sum + r.responseTime, 0) / 
      comparison.responses.length
    );
  }, [comparison.responses]);

  const totalTokens = useMemo(() => {
    return comparison.responses.reduce((sum, r) => sum + r.tokenCount, 0);
  }, [comparison.responses]);

  return (
    <div className={cn('max-w-7xl mx-auto space-y-6', className)}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Comparison Results
            </h1>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              &ldquo;{comparison.prompt}&rdquo;
            </p>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <ClockIcon className="h-4 w-4" />
                <span>{formatDate(comparison.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <ChatBubbleLeftRightIcon className="h-4 w-4" />
                <span>{comparison.responses.length} models</span>
              </div>
              <div className="flex items-center gap-1">
                <span>Avg: {averageResponseTime}ms</span>
              </div>
              <div className="flex items-center gap-1">
                <span>{totalTokens.toLocaleString()} tokens</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sort options */}
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as 'votes' | 'speed' | 'length')}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="votes">Sort by Votes</option>
              <option value="speed">Sort by Speed</option>
              <option value="length">Sort by Length</option>
            </select>

            {/* Action buttons */}
            <button
              type="button"
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <ShareIcon className="h-4 w-4 mr-1" />
              Share
            </button>
            
            <button
              type="button"
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <DocumentDuplicateIcon className="h-4 w-4 mr-1" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Similarity Metrics */}
      <SimilarityMetrics 
        metrics={comparison.metrics}
        responses={comparison.responses}
      />

      {/* Main content area */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Response Cards */}
        <div className="flex-1">
          <div className={cn('grid gap-4', gridColumns)}>
            {sortedResponses.map((response, index) => (
              <ResponseCard
                key={response.id}
                response={response}
                comparisonId={comparison.id}
                rank={index + 1}
                isSelected={selectedResponse === response.id}
                onSelect={() => setSelectedResponse(
                  selectedResponse === response.id ? null : response.id
                )}
              />
            ))}
          </div>
        </div>

        {/* Voting Sidebar */}
        <div className="lg:w-80">
          <VotingInterface
            comparison={comparison}
            selectedResponseId={selectedResponse}
          />
        </div>
      </div>
    </div>
  );
}