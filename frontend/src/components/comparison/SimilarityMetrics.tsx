'use client';

import React from 'react';
import { 
  RadialBarChart, 
  RadialBar, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import type { ComparisonMetrics, AIResponse } from '@/types/comparison';
import { getSimilarityScore, getModelName, cn } from '@/lib/utils';
import { 
  ChartBarIcon,
  ClockIcon,
  DocumentTextIcon,
  FaceSmileIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

interface SimilarityMetricsProps {
  metrics: ComparisonMetrics;
  responses: AIResponse[];
}

export function SimilarityMetrics({ metrics, responses }: SimilarityMetricsProps) {
  const metricsData = [
    {
      name: 'Semantic',
      value: metrics.semantic,
      color: '#10B981', // green-500
      icon: SparklesIcon,
      description: 'How similar the meanings are across responses'
    },
    {
      name: 'Length',
      value: metrics.length,
      color: '#3B82F6', // blue-500
      icon: DocumentTextIcon,
      description: 'How consistent response lengths are'
    },
    {
      name: 'Sentiment',
      value: metrics.sentiment,
      color: '#F59E0B', // amber-500
      icon: FaceSmileIcon,
      description: 'How aligned the emotional tones are'
    },
    {
      name: 'Speed',
      value: metrics.speed,
      color: '#8B5CF6', // violet-500
      icon: ClockIcon,
      description: 'Relative response times across models'
    }
  ];

  // Add optional metrics if they exist
  if (metrics.coherence !== undefined) {
    metricsData.push({
      name: 'Coherence',
      value: metrics.coherence,
      color: '#EF4444', // red-500
      icon: ChartBarIcon,
      description: 'How well-structured and logical the responses are'
    });
  }

  if (metrics.creativity !== undefined) {
    metricsData.push({
      name: 'Creativity',
      value: metrics.creativity,
      color: '#EC4899', // pink-500
      icon: SparklesIcon,
      description: 'How creative and original the responses are'
    });
  }

  // Prepare response time data for bar chart
  const responseTimeData = responses.map(response => ({
    name: getModelName(response.model).split(' ')[0], // Shorten names
    time: response.responseTime,
    tokens: response.tokenCount
  })).sort((a, b) => a.time - b.time);

  // Prepare token distribution data
  const tokenData = responses.map((response, index) => ({
    name: getModelName(response.model).split(' ')[0],
    value: response.tokenCount,
    color: `hsl(${index * 360 / responses.length}, 70%, 50%)`
  }));

  const overallScore = Math.round(
    (metrics.semantic + metrics.length + metrics.sentiment + metrics.speed) / 4
  );
  const overallScoreInfo = getSimilarityScore(overallScore);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          📊 Comparison Metrics
        </h2>
        <div className={cn(
          'px-3 py-1 rounded-full text-sm font-medium',
          overallScoreInfo.bgColor,
          overallScoreInfo.color
        )}>
          Overall: {overallScore}% ({overallScoreInfo.label})
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Similarity Metrics */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Similarity Scores
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {metricsData.map((metric) => {
              const scoreInfo = getSimilarityScore(metric.value);
              const Icon = metric.icon;
              
              return (
                <div
                  key={metric.name}
                  className="relative bg-gray-50 dark:bg-gray-700 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  title={metric.description}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {metric.name}
                      </span>
                    </div>
                    <span className={cn('text-xs px-2 py-1 rounded-full font-medium', scoreInfo.bgColor, scoreInfo.color)}>
                      {metric.value}%
                    </span>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${metric.value}%`,
                        backgroundColor: metric.color
                      }}
                    />
                  </div>
                  
                  {/* Radial chart for larger screens */}
                  <div className="hidden lg:block absolute top-2 right-2 w-8 h-8">
                    <ResponsiveContainer>
                      <RadialBarChart data={[{ value: metric.value }]}>
                        <RadialBar
                          dataKey="value"
                          cornerRadius={2}
                          fill={metric.color}
                          startAngle={90}
                          endAngle={-270}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Performance Metrics */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Response Performance
          </h3>
          
          {/* Response times bar chart */}
          <div className="mb-6">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              Response Times (ms)
            </h4>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={responseTimeData}>
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 10 }}
                    stroke="#6B7280"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    stroke="#6B7280"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(17, 24, 39, 0.95)',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    formatter={(value, name) => [
                      `${value}ms`,
                      name === 'time' ? 'Response Time' : name
                    ]}
                  />
                  <Bar 
                    dataKey="time" 
                    fill="#3B82F6"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Token distribution pie chart */}
          <div>
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              Token Distribution
            </h4>
            <div className="h-32 flex items-center">
              <div className="w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tokenData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={20}
                      outerRadius={40}
                    >
                      {tokenData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [
                        `${value.toLocaleString()} tokens`,
                        'Tokens'
                      ]}
                      contentStyle={{
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 space-y-1">
                {tokenData.map((item, index) => (
                  <div key={item.name} className="flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {item.name}: {item.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary insights */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {responses.length}
            </div>
            <div className="text-gray-600 dark:text-gray-400">Models Compared</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {Math.round(responses.reduce((sum, r) => sum + r.responseTime, 0) / responses.length)}ms
            </div>
            <div className="text-gray-600 dark:text-gray-400">Avg Response Time</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {Math.round(responses.reduce((sum, r) => sum + r.tokenCount, 0) / responses.length)}
            </div>
            <div className="text-gray-600 dark:text-gray-400">Avg Tokens</div>
          </div>
        </div>
      </div>
    </div>
  );
}