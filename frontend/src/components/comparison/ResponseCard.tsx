'use client';

import React, { useState } from 'react';
import type { AIResponse } from '@/types/comparison';
import { 
  HandThumbUpIcon, 
  HandThumbDownIcon,
  ClockIcon,
  HashtagIcon,
  DocumentDuplicateIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import { 
  HandThumbUpIcon as HandThumbUpSolid,
  HandThumbDownIcon as HandThumbDownSolid
} from '@heroicons/react/24/solid';
import { getModelEmoji, getModelName, formatTokenCost, calculateTokenCost, copyToClipboard, cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useCreateNotification } from '@/lib/store';

interface ResponseCardProps {
  response: AIResponse;
  comparisonId: string;
  rank: number;
  isSelected: boolean;
  onSelect: () => void;
}

export function ResponseCard({ 
  response, 
  comparisonId, 
  rank, 
  isSelected, 
  onSelect 
}: ResponseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [userVote, setUserVote] = useState<'up' | 'down' | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const { notifySuccess, notifyError } = useCreateNotification();

  const voteScore = (response.votes?.thumbsUp || 0) - (response.votes?.thumbsDown || 0);
  const shouldTruncate = response.content.length > 500;
  const displayContent = shouldTruncate && !isExpanded 
    ? response.content.substring(0, 500) + '...'
    : response.content;
  
  const tokenCost = calculateTokenCost(response.tokenCount, response.model);

  const handleVote = async (voteType: 'up' | 'down') => {
    if (isVoting) return;

    setIsVoting(true);
    try {
      await apiClient.voteOnResponse(response.id, {
        type: voteType === 'up' ? 'thumbs_up' : 'thumbs_down',
        userId: 'current-user', // This would come from auth context
        comparisonId,
        responseId: response.id
      });

      setUserVote(voteType);
      notifySuccess('Vote recorded', 'Your vote has been saved successfully.');
    } catch (error) {
      notifyError('Vote failed', 'Failed to record your vote. Please try again.');
    } finally {
      setIsVoting(false);
    }
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(response.content);
    if (success) {
      notifySuccess('Copied', 'Response copied to clipboard');
    } else {
      notifyError('Copy failed', 'Failed to copy to clipboard');
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 2:
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 3:
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div 
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg shadow-sm border transition-all duration-200 cursor-pointer',
        isSelected 
          ? 'border-indigo-500 ring-2 ring-indigo-500 ring-opacity-50' 
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      )}
      onClick={onSelect}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{getModelEmoji(response.model)}</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {getModelName(response.model)}
            </span>
            <span className={cn('px-2 py-1 text-xs font-medium rounded-full border', getRankColor(rank))}>
              {getRankIcon(rank)}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Vote buttons */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleVote('up');
              }}
              disabled={isVoting}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                userVote === 'up'
                  ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
              )}
              title="Helpful response"
            >
              {userVote === 'up' ? (
                <HandThumbUpSolid className="h-4 w-4" />
              ) : (
                <HandThumbUpIcon className="h-4 w-4" />
              )}
            </button>
            
            <span className={cn(
              'text-sm font-medium px-2 py-1 rounded-md',
              voteScore > 0 ? 'text-green-600 bg-green-50 dark:bg-green-900/20' :
              voteScore < 0 ? 'text-red-600 bg-red-50 dark:bg-red-900/20' :
              'text-gray-500 bg-gray-50 dark:bg-gray-700'
            )}>
              {voteScore > 0 ? `+${voteScore}` : voteScore}
            </span>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleVote('down');
              }}
              disabled={isVoting}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                userVote === 'down'
                  ? 'text-red-600 bg-red-50 dark:bg-red-900/20'
                  : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
              )}
              title="Not helpful"
            >
              {userVote === 'down' ? (
                <HandThumbDownSolid className="h-4 w-4" />
              ) : (
                <HandThumbDownIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mb-4">
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
            {displayContent}
          </pre>
          
          {shouldTruncate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUpIcon className="h-4 w-4" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDownIcon className="h-4 w-4" />
                  Show more
                </>
              )}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <ClockIcon className="h-3 w-3" />
              <span>{response.responseTime}ms</span>
            </div>
            <div className="flex items-center space-x-1">
              <HashtagIcon className="h-3 w-3" />
              <span>{response.tokenCount.toLocaleString()} tokens</span>
            </div>
            <div>
              <span>{formatTokenCost(tokenCost)}</span>
            </div>
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Copy response"
          >
            <DocumentDuplicateIcon className="h-3 w-3" />
          </button>
        </div>

        {/* Additional metadata when expanded */}
        {isExpanded && response.metadata && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div>
                <span className="font-medium">Temperature:</span> {response.metadata.temperature}
              </div>
              <div>
                <span className="font-medium">Finish reason:</span> {response.metadata.finishReason}
              </div>
              <div>
                <span className="font-medium">Prompt tokens:</span> {response.metadata.usage.promptTokens}
              </div>
              <div>
                <span className="font-medium">Completion tokens:</span> {response.metadata.usage.completionTokens}
              </div>
            </div>
          </div>
        )}

        {/* Ratings summary */}
        {response.ratings && response.ratings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                {response.ratings.length} rating{response.ratings.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span 
                    key={star} 
                    className={cn(
                      'text-xs',
                      star <= Math.round(response.ratings.reduce((sum, r) => sum + r.rating, 0) / response.ratings.length)
                        ? 'text-yellow-400'
                        : 'text-gray-300 dark:text-gray-600'
                    )}
                  >
                    ★
                  </span>
                ))}
                <span className="ml-1">
                  {(response.ratings.reduce((sum, r) => sum + r.rating, 0) / response.ratings.length).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}