'use client';

import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { useUI } from '@/lib/store';

interface AnalyticsChartProps {
  data: any[];
  type: 'line' | 'area' | 'bar' | 'pie' | 'radar';
  xKey?: string;
  yKey?: string;
  height?: number;
  colors?: string[];
  title?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  strokeWidth?: number;
}

const DEFAULT_COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // green-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#84CC16'  // lime-500
];

export function AnalyticsChart({
  data,
  type,
  xKey = 'name',
  yKey = 'value',
  height = 300,
  colors = DEFAULT_COLORS,
  title,
  showGrid = true,
  showTooltip = true,
  strokeWidth = 2
}: AnalyticsChartProps) {
  const { theme } = useUI();
  
  const isDark = theme === 'dark';
  
  const chartTheme = {
    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
    textColor: isDark ? '#E5E7EB' : '#374151',
    gridColor: isDark ? '#374151' : '#E5E7EB',
    tooltipBg: isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipBorder: isDark ? '#4B5563' : '#D1D5DB'
  };

  const TooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3"
        style={{
          backgroundColor: chartTheme.tooltipBg,
          borderColor: chartTheme.tooltipBorder
        }}
      >
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
          {label}
        </p>
        {payload.map((entry: any, index: number) => (
          <p
            key={index}
            className="text-xs"
            style={{ color: entry.color }}
          >
            {`${entry.name}: ${entry.value}`}
          </p>
        ))}
      </div>
    );
  };

  const renderChart = () => {
    switch (type) {
      case 'line':
        return (
          <LineChart data={data}>
            {showGrid && (
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke={chartTheme.gridColor}
                strokeOpacity={0.3}
              />
            )}
            <XAxis 
              dataKey={xKey} 
              stroke={chartTheme.textColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke={chartTheme.textColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            {showTooltip && <Tooltip content={<TooltipContent />} />}
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={colors[0]}
              strokeWidth={strokeWidth}
              dot={{ fill: colors[0], strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: colors[0], strokeWidth: 2 }}
            />
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart data={data}>
            {showGrid && (
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke={chartTheme.gridColor}
                strokeOpacity={0.3}
              />
            )}
            <XAxis 
              dataKey={xKey} 
              stroke={chartTheme.textColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke={chartTheme.textColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            {showTooltip && <Tooltip content={<TooltipContent />} />}
            <Area
              type="monotone"
              dataKey={yKey}
              stroke={colors[0]}
              fill={colors[0]}
              fillOpacity={0.3}
              strokeWidth={strokeWidth}
            />
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart data={data}>
            {showGrid && (
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke={chartTheme.gridColor}
                strokeOpacity={0.3}
              />
            )}
            <XAxis 
              dataKey={xKey} 
              stroke={chartTheme.textColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis 
              stroke={chartTheme.textColor}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            {showTooltip && <Tooltip content={<TooltipContent />} />}
            <Bar
              dataKey={yKey}
              fill={colors[0]}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        );

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey={yKey}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            {showTooltip && <Tooltip content={<TooltipContent />} />}
          </PieChart>
        );

      case 'radar':
        return (
          <RadarChart data={data}>
            <PolarGrid gridType="polygon" />
            <PolarAngleAxis 
              dataKey={xKey} 
              tick={{ fill: chartTheme.textColor, fontSize: 12 }}
            />
            <PolarRadiusAxis 
              tick={{ fill: chartTheme.textColor, fontSize: 10 }}
              tickCount={4}
            />
            <Radar
              dataKey={yKey}
              stroke={colors[0]}
              fill={colors[0]}
              fillOpacity={0.3}
              strokeWidth={strokeWidth}
            />
            {showTooltip && <Tooltip content={<TooltipContent />} />}
          </RadarChart>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          {title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

// Utility component for multiple series charts
interface MultiSeriesChartProps {
  data: any[];
  series: Array<{
    key: string;
    name: string;
    color: string;
  }>;
  type: 'line' | 'area' | 'bar';
  xKey?: string;
  height?: number;
  showGrid?: boolean;
  showTooltip?: boolean;
  title?: string;
}

export function MultiSeriesChart({
  data,
  series,
  type,
  xKey = 'name',
  height = 300,
  showGrid = true,
  showTooltip = true,
  title
}: MultiSeriesChartProps) {
  const { theme } = useUI();
  const isDark = theme === 'dark';
  
  const chartTheme = {
    textColor: isDark ? '#E5E7EB' : '#374151',
    gridColor: isDark ? '#374151' : '#E5E7EB',
  };

  const renderChart = () => {
    const ChartComponent = type === 'line' ? LineChart : type === 'area' ? AreaChart : BarChart;
    
    return (
      <ChartComponent data={data}>
        {showGrid && (
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke={chartTheme.gridColor}
            strokeOpacity={0.3}
          />
        )}
        <XAxis 
          dataKey={xKey} 
          stroke={chartTheme.textColor}
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis 
          stroke={chartTheme.textColor}
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        {showTooltip && <Tooltip />}
        
        {series.map((s, index) => {
          if (type === 'line') {
            return (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={{ fill: s.color, strokeWidth: 2, r: 4 }}
              />
            );
          } else if (type === 'area') {
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stackId={1}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.3}
              />
            );
          } else {
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                fill={s.color}
                radius={index === 0 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            );
          }
        })}
      </ChartComponent>
    );
  };

  return (
    <div className="w-full">
      {title && (
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          {title}
        </h4>
      )}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
      
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {series.map((s) => (
          <div key={s.key} className="flex items-center space-x-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {s.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}