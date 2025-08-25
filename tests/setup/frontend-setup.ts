import '@testing-library/jest-dom';
import { beforeAll, afterEach } from '@jest/globals';
import { cleanup } from '@testing-library/react';
import { server } from '../mocks/msw-server';

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
      beforePopState: jest.fn(() => {}),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
      isFallback: false,
    };
  },
}));

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));

// Mock Chakra UI toast
jest.mock('@chakra-ui/react', () => {
  const actual = jest.requireActual('@chakra-ui/react');
  return {
    ...actual,
    useToast: () => jest.fn(),
  };
});

// Mock WebSocket
global.WebSocket = jest.fn(() => ({
  close: jest.fn(),
  send: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
})) as any;

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
})) as any;

// Mock ResizeObserver
global.ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
})) as any;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: jest.fn(),
});

// Mock environment variables for frontend
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
process.env.NEXT_PUBLIC_WS_URL = 'ws://localhost:3001';
process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = 'test_client_id';

// Frontend test utilities
globalThis.FrontendTestUtils = {
  // Mock user data
  mockUser: {
    id: 'user-123',
    discordId: '123456789',
    username: 'testuser',
    avatar: 'https://cdn.discordapp.com/avatars/123456789/test-avatar.png',
    preferences: {
      defaultModels: ['gpt-4', 'claude-3.5-sonnet'],
      notifications: true,
      theme: 'light' as const
    },
    guilds: [
      {
        id: 'guild-123',
        name: 'Test Guild',
        icon: 'test-icon.png',
        permissions: ['ADMINISTRATOR']
      }
    ]
  },

  // Mock comparison data
  mockComparison: {
    id: 'comparison-123',
    query: {
      id: 'query-123',
      prompt: 'Explain quantum computing in simple terms',
      parameters: { temperature: 0.7, maxTokens: 1000 },
      modelsRequested: ['gpt-4', 'claude-3.5-sonnet'],
      createdAt: new Date('2023-12-01T10:00:00Z')
    },
    responses: [
      {
        id: 'response-1',
        modelName: 'gpt-4',
        content: 'Quantum computing is a revolutionary technology that uses quantum mechanics...',
        metadata: {
          model: 'gpt-4',
          usage: { promptTokens: 15, completionTokens: 200, totalTokens: 215 }
        },
        responseTimeMs: 1200,
        tokenCount: 215,
        costUsd: 0.0043,
        votes: {
          thumbsUp: 8,
          thumbsDown: 2,
          starRatings: [5, 4, 5, 4, 5, 3, 4, 5, 4, 5]
        }
      },
      {
        id: 'response-2',
        modelName: 'claude-3.5-sonnet',
        content: 'Quantum computing represents a fundamental shift in how we process information...',
        metadata: {
          model: 'claude-3-5-sonnet-20240620',
          usage: { inputTokens: 15, outputTokens: 180 }
        },
        responseTimeMs: 950,
        tokenCount: 195,
        costUsd: 0.0024,
        votes: {
          thumbsUp: 6,
          thumbsDown: 1,
          starRatings: [4, 5, 4, 4, 5, 3, 4]
        }
      }
    ],
    metrics: {
      semantic: 87,
      length: 91,
      sentiment: 85,
      speed: 92
    },
    createdAt: new Date('2023-12-01T10:00:00Z')
  },

  // Custom render with providers
  renderWithProviders: (ui: React.ReactElement, options: any = {}) => {
    // This would wrap components with necessary providers
    const { render } = require('@testing-library/react');
    const { ChakraProvider } = require('@chakra-ui/react');
    const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
    
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const AllTheProviders = ({ children }: { children: React.ReactNode }) => (
      <ChakraProvider>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </ChakraProvider>
    );

    return render(ui, { wrapper: AllTheProviders, ...options });
  },

  // Simulate user interactions
  async simulateVote(getByRole: any, voteType: 'up' | 'down') {
    const { fireEvent } = require('@testing-library/react');
    const button = getByRole('button', { 
      name: voteType === 'up' ? /thumbs up/i : /thumbs down/i 
    });
    fireEvent.click(button);
    return button;
  },

  async simulateModelRating(getByRole: any, modelName: string, rating: number) {
    const { fireEvent } = require('@testing-library/react');
    const select = getByRole('combobox', { name: new RegExp(modelName, 'i') });
    fireEvent.change(select, { target: { value: rating.toString() } });
    return select;
  },

  // Wait for async operations
  async waitForApiCall(mockFn: jest.Mock) {
    const { waitFor } = require('@testing-library/react');
    await waitFor(() => {
      expect(mockFn).toHaveBeenCalled();
    });
  }
};

// Setup MSW server for API mocking
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  // Clean up DOM after each test
  cleanup();
  
  // Reset MSW handlers
  server.resetHandlers();
  
  // Clear all mocks
  jest.clearAllMocks();
});

afterAll(() => {
  server.close();
});