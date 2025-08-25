import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { 
  User, 
  CreateComparisonRequest, 
  GetComparisonsParams, 
  PaginatedResponse,
  APIError 
} from '@/types/api';
import type { Comparison, Vote } from '@/types/comparison';
import type { UserSettings } from '@/types/user';
import { API_ENDPOINTS, LOCAL_STORAGE_KEYS } from './constants';

export class APIClient {
  private client: AxiosInstance;
  private authToken: string | null = null;

  constructor(baseURL: string = API_ENDPOINTS.BASE_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
    this.loadAuthToken();
  }

  private loadAuthToken() {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
      if (token) {
        this.setAuthToken(token);
      }
    }
  }

  private setupInterceptors() {
    // Request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Handle token expiration
          await this.handleTokenExpiration();
        }
        
        // Transform API errors
        const apiError: APIError = {
          code: error.response?.data?.code || 'UNKNOWN_ERROR',
          message: error.response?.data?.message || error.message,
          details: error.response?.data?.details
        };
        
        return Promise.reject(apiError);
      }
    );
  }

  private async handleTokenExpiration() {
    this.clearAuthToken();
    
    // Redirect to login if in browser
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  }

  setAuthToken(token: string) {
    this.authToken = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN, token);
    }
  }

  clearAuthToken() {
    this.authToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_DATA);
    }
  }

  // Auth methods
  async getCurrentUser(): Promise<User> {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  async refreshToken(): Promise<string> {
    const response = await this.client.post('/auth/refresh');
    const newToken = response.data.token;
    this.setAuthToken(newToken);
    return newToken;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } finally {
      this.clearAuthToken();
    }
  }

  // Comparison methods
  async createComparison(data: CreateComparisonRequest): Promise<Comparison> {
    const response = await this.client.post('/comparisons', data);
    return response.data;
  }

  async getComparison(id: string): Promise<Comparison> {
    const response = await this.client.get(`/comparisons/${id}`);
    return response.data;
  }

  async getComparisons(params: GetComparisonsParams): Promise<PaginatedResponse<Comparison>> {
    const response = await this.client.get('/comparisons', { params });
    return response.data;
  }

  async deleteComparison(id: string): Promise<void> {
    await this.client.delete(`/comparisons/${id}`);
  }

  // Voting methods
  async voteOnResponse(responseId: string, vote: Vote): Promise<void> {
    await this.client.post(`/responses/${responseId}/vote`, vote);
  }

  async voteOnComparison(comparisonId: string, helpful: boolean): Promise<void> {
    await this.client.post(`/comparisons/${comparisonId}/vote`, { helpful });
  }

  async rateResponse(responseId: string, rating: number, comment?: string): Promise<void> {
    await this.client.post(`/responses/${responseId}/rate`, { rating, comment });
  }

  // User settings methods
  async getUserSettings(): Promise<UserSettings> {
    const response = await this.client.get('/user/settings');
    return response.data;
  }

  async updateUserSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const response = await this.client.put('/user/settings', settings);
    return response.data;
  }

  async updateAPIKeys(apiKeys: Record<string, string>): Promise<void> {
    await this.client.put('/user/api-keys', { apiKeys });
  }

  // Analytics methods
  async getUserStats(): Promise<any> {
    const response = await this.client.get('/user/stats');
    return response.data;
  }

  async getAnalytics(params?: { dateFrom?: string; dateTo?: string; guildId?: string }): Promise<any> {
    const response = await this.client.get('/analytics', { params });
    return response.data;
  }

  // Error-prone operations with retry logic
  async withRetry<T>(
    operation: () => Promise<T>, 
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry auth errors or client errors
        if (error instanceof Error && 
           (error.message.includes('401') || error.message.includes('4'))) {
          throw error;
        }
        
        if (i < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, i); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  // File upload methods
  async uploadFile(file: File, type: 'avatar' | 'export'): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const response = await this.client.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

// Create singleton instance
export const apiClient = new APIClient();

// Error handling utility
export function isAPIError(error: any): error is APIError {
  return error && typeof error.code === 'string' && typeof error.message === 'string';
}

export function getErrorMessage(error: any): string {
  if (isAPIError(error)) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
}