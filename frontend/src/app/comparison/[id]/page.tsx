'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ComparisonView } from '@/components/comparison/ComparisonView';
import { useComparisons } from '@/lib/store';
import { apiClient } from '@/lib/api-client';
import { useComparisonSubscription } from '@/hooks/useWebSocket';
import type { Comparison } from '@/types/comparison';

export default function ComparisonPage() {
  const { id } = useParams();
  const comparisonId = Array.isArray(id) ? id[0] : id;
  
  const { comparisons, setActiveComparison } = useComparisons();
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to real-time updates for this comparison
  useComparisonSubscription(comparisonId);

  useEffect(() => {
    if (!comparisonId) return;

    const loadComparison = async () => {
      try {
        setLoading(true);
        setError(null);

        // First check if we already have it in store
        const existingComparison = comparisons.find(c => c.id === comparisonId);
        if (existingComparison) {
          setComparison(existingComparison);
          setActiveComparison(existingComparison);
          setLoading(false);
          return;
        }

        // Fetch from API
        const fetchedComparison = await apiClient.getComparison(comparisonId);
        setComparison(fetchedComparison);
        setActiveComparison(fetchedComparison);
      } catch (err) {
        console.error('Failed to load comparison:', err);
        setError('Failed to load comparison. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadComparison();
  }, [comparisonId, comparisons, setActiveComparison]);

  // Update comparison when store changes
  useEffect(() => {
    if (comparisonId) {
      const updated = comparisons.find(c => c.id === comparisonId);
      if (updated) {
        setComparison(updated);
      }
    }
  }, [comparisons, comparisonId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Loading comparison...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Comparison Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <a
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-4xl mb-4">🤖</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Comparison Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The comparison you're looking for doesn't exist or has been deleted.
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ComparisonView comparison={comparison} />
    </div>
  );
}