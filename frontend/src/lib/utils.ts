import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { SIMILARITY_THRESHOLDS, MODEL_INFO } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return formatDate(date);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function getModelEmoji(modelId: string): string {
  return MODEL_INFO[modelId as keyof typeof MODEL_INFO]?.emoji || '🤖';
}

export function getModelName(modelId: string): string {
  return MODEL_INFO[modelId as keyof typeof MODEL_INFO]?.name || modelId;
}

export function getSimilarityScore(value: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (value >= SIMILARITY_THRESHOLDS.EXCELLENT) {
    return {
      label: 'Excellent',
      color: 'text-green-700',
      bgColor: 'bg-green-100'
    };
  } else if (value >= SIMILARITY_THRESHOLDS.GOOD) {
    return {
      label: 'Good',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-100'
    };
  } else if (value >= SIMILARITY_THRESHOLDS.FAIR) {
    return {
      label: 'Fair',
      color: 'text-orange-700',
      bgColor: 'bg-orange-100'
    };
  } else {
    return {
      label: 'Poor',
      color: 'text-red-700',
      bgColor: 'bg-red-100'
    };
  }
}

export function calculateTokenCost(tokenCount: number, modelId: string, type: 'input' | 'output' = 'output'): number {
  const modelInfo = MODEL_INFO[modelId as keyof typeof MODEL_INFO];
  if (!modelInfo) return 0;
  
  const rate = type === 'input' ? modelInfo.pricing.input : modelInfo.pricing.output;
  return (tokenCount / 1000) * rate;
}

export function formatTokenCost(cost: number): string {
  if (cost < 0.001) return '<$0.001';
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  } else {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'absolute';
    textArea.style.left = '-999999px';
    
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return Promise.resolve(true);
    } catch (error) {
      document.body.removeChild(textArea);
      return Promise.resolve(false);
    }
  }
}

export function downloadAsJSON(data: any, filename: string): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}