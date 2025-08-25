export interface User {
  id: string;
  discordId: string;
  username: string;
  avatar?: string;
  guilds?: Guild[];
  preferences?: UserPreferences;
  createdAt: string;
  lastLogin?: string;
}

export interface Guild {
  id: string;
  name: string;
  icon?: string;
  permissions: string[];
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  defaultModels: string[];
  notifications: NotificationSettings;
}

export interface NotificationSettings {
  comparisonComplete: boolean;
  newVotes: boolean;
  weeklyDigest: boolean;
}

export interface CreateComparisonRequest {
  prompt: string;
  models: string[];
  temperature?: number;
  maxTokens?: number;
  guildId?: string;
}

export interface GetComparisonsParams {
  page?: number;
  limit?: number;
  guildId?: string;
  userId?: string;
  models?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface APIError {
  code: string;
  message: string;
  details?: any;
}