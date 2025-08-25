export interface UserSettings {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  defaultModels: string[];
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  apiKeys: APIKeySettings;
}

export interface NotificationSettings {
  comparisonComplete: boolean;
  newVotes: boolean;
  weeklyDigest: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface PrivacySettings {
  shareComparisons: boolean;
  showOnLeaderboard: boolean;
  allowDataExport: boolean;
}

export interface APIKeySettings {
  openai?: string;
  anthropic?: string;
  google?: string;
  cohere?: string;
  [key: string]: string | undefined;
}

export interface UserStats {
  totalComparisons: number;
  totalVotes: number;
  favoriteModels: string[];
  averageRating: number;
  joinedAt: string;
  lastActive: string;
}

export interface UserActivity {
  id: string;
  type: 'comparison' | 'vote' | 'rating';
  description: string;
  timestamp: string;
  metadata?: any;
}