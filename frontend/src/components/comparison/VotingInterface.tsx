'use client';

import React, { useState } from 'react';
import type { Comparison } from '@/types/comparison';
import { 
  HandThumbUpIcon, 
  HandThumbDownIcon,
  StarIcon,
  ChatBubbleLeftEllipsisIcon
} from '@heroicons/react/24/outline';
import { 
  HandThumbUpIcon as HandThumbUpSolid,
  HandThumbDownIcon as HandThumbDownSolid,
  StarIcon as StarSolid
} from '@heroicons/react/24/solid';
import { getModelName, cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useCreateNotification } from '@/lib/store';

interface VotingInterfaceProps {
  comparison: Comparison;
  selectedResponseId: string | null;
}

export function VotingInterface({ comparison, selectedResponseId }: VotingInterfaceProps) {
  const [overallVote, setOverallVote] = useState<boolean | null>(null);
  const [modelRatings, setModelRatings] = useState<Record<string, number>>({});
  const [ratingComments, setRatingComments] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { notifySuccess, notifyError } = useCreateNotification();

  const selectedResponse = selectedResponseId 
    ? comparison.responses.find(r => r.id === selectedResponseId)
    : null;

  const handleOverallVote = async (helpful: boolean) => {
    setIsSubmitting(true);
    try {
      await apiClient.voteOnComparison(comparison.id, helpful);
      setOverallVote(helpful);
      notifySuccess('Vote recorded', 'Your overall comparison vote has been saved.');
    } catch (error) {
      notifyError('Vote failed', 'Failed to record your vote. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModelRating = (responseId: string, rating: number) => {
    setModelRatings(prev => ({
      ...prev,
      [responseId]: rating
    }));
  };

  const submitRating = async (responseId: string) => {
    const rating = modelRatings[responseId];
    const comment = ratingComments[responseId];
    
    if (!rating) return;

    setIsSubmitting(true);
    try {
      await apiClient.rateResponse(responseId, rating, comment);
      notifySuccess('Rating submitted', 'Your model rating has been saved.');
    } catch (error) {
      notifyError('Rating failed', 'Failed to submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const StarRating = ({ 
    value, 
    onChange, 
    size = 'h-5 w-5' 
  }: { 
    value: number; 
    onChange: (rating: number) => void;
    size?: string;
  }) => (
    <div className="flex space-x-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="text-yellow-400 hover:text-yellow-500 transition-colors"
        >
          {star <= value ? (
            <StarSolid className={size} />
          ) : (
            <StarIcon className={size} />
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
        Rate This Comparison
      </h3>

      {/* Overall comparison vote */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Was this comparison helpful?
        </h4>
        <div className="flex space-x-3">
          <button
            onClick={() => handleOverallVote(true)}
            disabled={isSubmitting}
            className={cn(
              'flex items-center space-x-2 px-4 py-2 rounded-md border transition-colors',
              overallVote === true
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-200 dark:hover:border-green-800'
            )}
          >
            {overallVote === true ? (
              <HandThumbUpSolid className="h-4 w-4" />
            ) : (
              <HandThumbUpIcon className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">Helpful</span>
          </button>
          
          <button
            onClick={() => handleOverallVote(false)}
            disabled={isSubmitting}
            className={cn(
              'flex items-center space-x-2 px-4 py-2 rounded-md border transition-colors',
              overallVote === false
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800'
            )}
          >
            {overallVote === false ? (
              <HandThumbDownSolid className="h-4 w-4" />
            ) : (
              <HandThumbDownIcon className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">Not helpful</span>
          </button>
        </div>
      </div>

      {/* Individual model ratings */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Rate Individual Models
        </h4>
        <div className="space-y-4">
          {comparison.responses.map((response) => (
            <div
              key={response.id}
              className={cn(
                'p-4 rounded-lg border transition-all',
                selectedResponseId === response.id
                  ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {getModelName(response.model)}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {response.responseTime}ms
                </span>
              </div>
              
              <div className="mb-3">
                <StarRating
                  value={modelRatings[response.id] || 0}
                  onChange={(rating) => handleModelRating(response.id, rating)}
                />
              </div>
              
              <div className="mb-3">
                <textarea
                  placeholder="Add a comment (optional)..."
                  value={ratingComments[response.id] || ''}
                  onChange={(e) => setRatingComments(prev => ({
                    ...prev,
                    [response.id]: e.target.value
                  }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  rows={2}
                />
              </div>
              
              {modelRatings[response.id] && (
                <button
                  onClick={() => submitRating(response.id)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-md transition-colors"
                >
                  Submit Rating
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions for selected response */}
      {selectedResponse && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Quick Actions for {getModelName(selectedResponse.model)}
          </h4>
          <div className="space-y-2">
            <button
              type="button"
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
              <span>Ask Follow-up</span>
            </button>
            
            <button
              type="button"
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <span>🔄</span>
              <span>Regenerate</span>
            </button>
          </div>
        </div>
      )}

      {/* Comparison stats */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Comparison Stats
        </h4>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex justify-between">
            <span>Total votes:</span>
            <span>{comparison.votes.totalVoters}</span>
          </div>
          <div className="flex justify-between">
            <span>Helpful:</span>
            <span className="text-green-600 dark:text-green-400">
              {comparison.votes.helpful}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Not helpful:</span>
            <span className="text-red-600 dark:text-red-400">
              {comparison.votes.notHelpful}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}