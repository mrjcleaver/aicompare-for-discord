'use client';

import React, { useMemo } from 'react';
import { useComparisons } from '@/lib/store';
import { AnalyticsChart } from './AnalyticsChart';
import { RecentQueries } from './RecentQueries';
import { 
  ChartBarIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  StarIcon,
  TrendingUpIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import { formatDate, getModelName } from '@/lib/utils';

export function DashboardOverview() {
  const { comparisons } = useComparisons();

  const stats = useMemo(() => {
    const totalComparisons = comparisons.length;
    const totalResponses = comparisons.reduce((sum, c) => sum + c.responses.length, 0);
    const avgResponseTime = comparisons.length > 0 
      ? Math.round(
          comparisons.reduce((sum, c) => 
            sum + c.responses.reduce((respSum, r) => respSum + r.responseTime, 0) / c.responses.length, 0
          ) / comparisons.length
        )
      : 0;
    
    const totalVotes = comparisons.reduce((sum, c) => 
      sum + c.responses.reduce((respSum, r) => 
        respSum + (r.votes?.thumbsUp || 0) + (r.votes?.thumbsDown || 0), 0
      ), 0
    );

    const avgSimilarity = comparisons.length > 0 
      ? Math.round(
          comparisons.reduce((sum, c) => 
            sum + (c.metrics.semantic + c.metrics.length + c.metrics.sentiment + c.metrics.speed) / 4, 0
          ) / comparisons.length
        )
      : 0;

    // Model popularity
    const modelCounts = new Map<string, number>();
    comparisons.forEach(c => {
      c.responses.forEach(r => {
        modelCounts.set(r.model, (modelCounts.get(r.model) || 0) + 1);
      });
    });

    const topModels = Array.from(modelCounts.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);

    return {
      totalComparisons,
      totalResponses,
      avgResponseTime,
      totalVotes,
      avgSimilarity,
      topModels
    };
  }, [comparisons]);

  const recentActivity = useMemo(() => {
    return comparisons
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        type: 'comparison' as const,
        prompt: c.prompt,
        timestamp: c.createdAt,
        models: c.responses.map(r => r.model),
        status: c.status
      }));
  }, [comparisons]);

  const chartData = useMemo(() => {
    // Group comparisons by day for the last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const dailyData = new Map<string, number>();
    
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      dailyData.set(dateKey, 0);
    }

    comparisons.forEach(c => {
      const date = new Date(c.createdAt);
      if (date >= thirtyDaysAgo) {
        const dateKey = date.toISOString().split('T')[0];
        dailyData.set(dateKey, (dailyData.get(dateKey) || 0) + 1);
      }
    });

    return Array.from(dailyData.entries()).map(([date, count]) => ({
      date,
      comparisons: count,
      formattedDate: new Date(date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      })
    }));
  }, [comparisons]);

  const StatCard = ({ 
    title, 
    value, 
    change, 
    icon: Icon, 
    color = 'indigo' 
  }: {
    title: string;
    value: string | number;
    change?: string;
    icon: React.ComponentType<{ className?: string }>;
    color?: string;
  }) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <Icon className={`h-8 w-8 text-${color}-600`} />
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              {title}
            </dt>
            <dd className="flex items-baseline">
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </div>
              {change && (
                <div className="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                  <TrendingUpIcon className="self-center flex-shrink-0 h-4 w-4 text-green-500" />
                  <span className="sr-only">Increased by</span>
                  {change}
                </div>
              )}
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Overview of your AI model comparisons and analytics
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Comparisons"
          value={stats.totalComparisons}
          icon={ChatBubbleLeftRightIcon}
          change="+12%"
          color="blue"
        />
        <StatCard
          title="Total Responses"
          value={stats.totalResponses}
          icon={ChartBarIcon}
          change="+8%"
          color="green"
        />
        <StatCard
          title="Avg Response Time"
          value={`${stats.avgResponseTime}ms`}
          icon={ClockIcon}
          change="-5%"
          color="yellow"
        />
        <StatCard
          title="Total Votes"
          value={stats.totalVotes}
          icon={StarIcon}
          change="+23%"
          color="purple"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Daily Activity (Last 30 Days)
          </h3>
          <AnalyticsChart
            data={chartData}
            xKey="formattedDate"
            yKey="comparisons"
            type="area"
            height={300}
          />
        </div>

        {/* Top Models */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Most Used Models
          </h3>
          <div className="space-y-4">
            {stats.topModels.map(([modelId, count], index) => (
              <div key={modelId} className="flex items-center">
                <div className="flex-shrink-0 w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-400">
                  #{index + 1}
                </div>
                <div className="ml-3 flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {getModelName(modelId)}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {count} response{count !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${(count / Math.max(...stats.topModels.map(([,c]) => c))) * 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity and Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Queries */}
        <div className="lg:col-span-2">
          <RecentQueries queries={recentActivity} />
        </div>

        {/* Performance Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Performance Summary
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Avg Similarity Score</span>
                <span className="font-medium text-gray-900 dark:text-white">{stats.avgSimilarity}%</span>
              </div>
              <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${stats.avgSimilarity}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Response Quality</span>
                <span className="font-medium text-gray-900 dark:text-white">85%</span>
              </div>
              <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: '85%' }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">User Satisfaction</span>
                <span className="font-medium text-gray-900 dark:text-white">92%</span>
              </div>
              <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: '92%' }}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center text-gray-600 dark:text-gray-400">
                  <UserGroupIcon className="h-4 w-4 mr-1" />
                  Active Users
                </span>
                <span className="font-medium text-gray-900 dark:text-white">127</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}