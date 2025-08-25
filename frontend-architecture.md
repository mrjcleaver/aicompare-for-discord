# Frontend Architecture Specification
## Multi-AI Query & Comparison Tool

---

## 1. DISCORD BOT ARCHITECTURE

### 1.1 Discord.js Implementation Patterns

```javascript
// Core Bot Structure
const { Client, GatewayIntentBits, Collection } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Command Collection Pattern
client.commands = new Collection();
client.cooldowns = new Collection();

// Event Handler Pattern
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  client.on(event.name, (...args) => event.execute(...args));
}
```

### 1.2 Slash Command Structure

#### `/compare` Command Implementation
```javascript
// commands/compare.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compare')
    .setDescription('Compare AI model responses')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Your query for AI models')
        .setRequired(true)
        .setMaxLength(4000)
    )
    .addStringOption(option =>
      option.setName('models')
        .setDescription('Select models to compare')
        .addChoices(
          { name: 'GPT-4 + Claude-3.5', value: 'gpt4,claude35' },
          { name: 'All Models', value: 'all' },
          { name: 'Custom Selection', value: 'custom' }
        )
    )
    .addNumberOption(option =>
      option.setName('temperature')
        .setDescription('Model creativity (0.0-1.0)')
        .setMinValue(0.0)
        .setMaxValue(1.0)
    ),

  async execute(interaction) {
    // Immediate acknowledgment
    await interaction.deferReply({ ephemeral: false });

    const prompt = interaction.options.getString('prompt');
    const modelSelection = interaction.options.getString('models') || 'gpt4,claude35';
    const temperature = interaction.options.getNumber('temperature') || 0.7;

    // Queue parallel AI queries
    const queryId = await queueAIComparison({
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      prompt,
      models: parseModelSelection(modelSelection),
      temperature,
      messageId: interaction.id
    });

    // Return progress embed
    const progressEmbed = createProgressEmbed(queryId, modelSelection);
    await interaction.editReply({ embeds: [progressEmbed] });
  }
};
```

#### `/history` Command Implementation
```javascript
// commands/history.js
module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View previous AI comparisons')
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of results (1-25)')
        .setMinValue(1)
        .setMaxValue(25)
    )
    .addStringOption(option =>
      option.setName('filter')
        .setDescription('Filter by model or user')
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const limit = interaction.options.getInteger('limit') || 10;
    const filter = interaction.options.getString('filter');

    const history = await getQueryHistory({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      limit,
      filter
    });

    const historyEmbed = createHistoryEmbed(history);
    const navigationRow = createHistoryNavigation(history.page, history.totalPages);

    await interaction.editReply({
      embeds: [historyEmbed],
      components: [navigationRow]
    });
  }
};
```

#### `/settings` Command Implementation
```javascript
// commands/settings.js
module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure AI comparison preferences')
    .addSubcommand(subcommand =>
      subcommand
        .setName('models')
        .setDescription('Set default model preferences')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('notifications')
        .setDescription('Configure notification settings')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('apikeys')
        .setDescription('Manage API keys (DM only)')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'models':
        await handleModelSettings(interaction);
        break;
      case 'notifications':
        await handleNotificationSettings(interaction);
        break;
      case 'apikeys':
        await handleAPIKeySettings(interaction);
        break;
    }
  }
};
```

### 1.3 Rich Embed Formatting

```javascript
// utils/embeds.js
function createComparisonEmbed(queryId, responses, metrics) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 AI Model Comparison Results')
    .setDescription(`**Query ID:** \`${queryId}\``)
    .setColor(0x00AE86)
    .setTimestamp()
    .setFooter({ 
      text: 'React with 👍/👎 to vote • View details on dashboard',
      iconURL: 'https://cdn.discordapp.com/app-icons/YOUR_BOT_ID/icon.png'
    });

  // Add response fields with truncation
  responses.forEach((response, index) => {
    const truncatedResponse = response.content.length > 1024 
      ? response.content.substring(0, 1021) + '...'
      : response.content;

    embed.addFields({
      name: `${getModelEmoji(response.model)} ${response.model}`,
      value: `\`\`\`\n${truncatedResponse}\n\`\`\`\n**Time:** ${response.responseTime}ms | **Tokens:** ${response.tokenCount}`,
      inline: false
    });
  });

  // Add similarity metrics
  if (metrics) {
    embed.addFields({
      name: '📊 Similarity Metrics',
      value: `**Semantic:** ${metrics.semantic}% | **Length:** ${metrics.length}% | **Sentiment:** ${metrics.sentiment}%`,
      inline: false
    });
  }

  return embed;
}

function createProgressEmbed(queryId, models) {
  return new EmbedBuilder()
    .setTitle('⏳ Processing AI Comparison')
    .setDescription(`**Query ID:** \`${queryId}\`\n**Models:** ${models}\n\n🔄 Querying models in parallel...`)
    .setColor(0xFFAA00)
    .setTimestamp();
}
```

### 1.4 Interactive Components

```javascript
// utils/components.js
function createVotingComponents(queryId) {
  const voteRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_${queryId}_thumbs_up`)
        .setLabel('👍 Helpful')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`vote_${queryId}_thumbs_down`)
        .setLabel('👎 Not Helpful')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`details_${queryId}`)
        .setLabel('📊 View Details')
        .setStyle(ButtonStyle.Link)
        .setURL(`${process.env.WEB_DASHBOARD_URL}/comparison/${queryId}`)
    );

  const modelSelectRow = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rate_model_${queryId}`)
        .setPlaceholder('Rate individual models (1-5 stars)')
        .addOptions([
          { label: 'GPT-4', value: 'gpt4', emoji: '🧠' },
          { label: 'Claude-3.5-Sonnet', value: 'claude35', emoji: '🎭' },
          { label: 'Gemini-1.5-Pro', value: 'gemini15', emoji: '💎' },
          { label: 'Command-R+', value: 'commandr', emoji: '⚡' }
        ])
    );

  return [voteRow, modelSelectRow];
}

// Interaction handlers
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('vote_')) {
      await handleVoteInteraction(interaction);
    } else if (interaction.customId.startsWith('details_')) {
      await handleDetailsInteraction(interaction);
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('rate_model_')) {
      await handleModelRatingInteraction(interaction);
    }
  }
});
```

### 1.5 Discord OAuth Integration

```javascript
// auth/discord-oauth.js
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: `${process.env.BASE_URL}/auth/discord/callback`,
  scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ discordId: profile.id });
    
    if (!user) {
      user = await User.create({
        discordId: profile.id,
        username: profile.username,
        avatar: profile.avatar,
        accessToken: encrypt(accessToken),
        refreshToken: encrypt(refreshToken),
        guilds: profile.guilds || []
      });
    } else {
      // Update user info and tokens
      await user.update({
        username: profile.username,
        avatar: profile.avatar,
        accessToken: encrypt(accessToken),
        refreshToken: encrypt(refreshToken),
        guilds: profile.guilds || [],
        lastLogin: new Date()
      });
    }

    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));
```

---

## 2. WEB DASHBOARD FRONTEND

### 2.1 React/Next.js Architecture

```javascript
// Directory Structure
src/
├── components/
│   ├── common/
│   │   ├── Layout.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   ├── comparison/
│   │   ├── ComparisonView.tsx
│   │   ├── ResponseCard.tsx
│   │   ├── SimilarityMetrics.tsx
│   │   └── VotingInterface.tsx
│   ├── dashboard/
│   │   ├── DashboardOverview.tsx
│   │   ├── RecentQueries.tsx
│   │   └── AnalyticsChart.tsx
│   └── settings/
│       ├── ModelPreferences.tsx
│       ├── APIKeyManager.tsx
│       └── NotificationSettings.tsx
├── pages/
│   ├── api/
│   │   ├── auth/
│   │   ├── queries/
│   │   └── settings/
│   ├── comparison/
│   │   └── [id].tsx
│   ├── dashboard/
│   │   └── index.tsx
│   ├── settings/
│   │   └── index.tsx
│   └── _app.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useWebSocket.ts
│   ├── useQueries.ts
│   └── useVoting.ts
├── lib/
│   ├── api-client.ts
│   ├── websocket.ts
│   ├── auth.ts
│   └── utils.ts
└── types/
    ├── api.ts
    ├── comparison.ts
    └── user.ts
```

### 2.2 Component Hierarchy and State Management

```typescript
// lib/store.ts - Zustand for state management
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  // Auth state
  user: User | null;
  isAuthenticated: boolean;
  
  // Comparison state
  activeComparison: Comparison | null;
  comparisons: Comparison[];
  
  // UI state
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark';
  
  // Actions
  setUser: (user: User | null) => void;
  setActiveComparison: (comparison: Comparison) => void;
  addComparison: (comparison: Comparison) => void;
  updateComparison: (id: string, updates: Partial<Comparison>) => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      activeComparison: null,
      comparisons: [],
      sidebarCollapsed: false,
      theme: 'light',
      
      // Actions
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setActiveComparison: (comparison) => set({ activeComparison: comparison }),
      addComparison: (comparison) => set((state) => ({
        comparisons: [comparison, ...state.comparisons]
      })),
      updateComparison: (id, updates) => set((state) => ({
        comparisons: state.comparisons.map(c => 
          c.id === id ? { ...c, ...updates } : c
        ),
        activeComparison: state.activeComparison?.id === id 
          ? { ...state.activeComparison, ...updates } 
          : state.activeComparison
      })),
      toggleSidebar: () => set((state) => ({ 
        sidebarCollapsed: !state.sidebarCollapsed 
      })),
      setTheme: (theme) => set({ theme })
    }),
    {
      name: 'aicompare-storage',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed
      })
    }
  )
);
```

### 2.3 Real-time Updates with WebSocket

```typescript
// hooks/useWebSocket.ts
import { useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';

interface WebSocketMessage {
  type: 'comparison_update' | 'vote_update' | 'new_comparison';
  data: any;
}

export function useWebSocket(userId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const { updateComparison, addComparison } = useStore();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}?userId=${userId}`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      // Clear any reconnection timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    wsRef.current.onmessage = (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'comparison_update':
          updateComparison(message.data.id, message.data);
          break;
        case 'vote_update':
          updateComparison(message.data.comparisonId, {
            votes: message.data.votes
          });
          break;
        case 'new_comparison':
          addComparison(message.data);
          break;
      }
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected');
      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [userId, updateComparison, addComparison]);

  useEffect(() => {
    if (userId) {
      connect();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect, userId]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { sendMessage };
}
```

### 2.4 Responsive Design Patterns

```typescript
// components/comparison/ComparisonView.tsx
import { useState, useMemo } from 'react';
import { useBreakpointValue, Grid, Box, Flex } from '@chakra-ui/react';
import { ResponseCard } from './ResponseCard';
import { SimilarityMetrics } from './SimilarityMetrics';
import { VotingInterface } from './VotingInterface';

export function ComparisonView({ comparison }: { comparison: Comparison }) {
  const [selectedResponse, setSelectedResponse] = useState<string | null>(null);
  
  // Responsive layout configuration
  const gridColumns = useBreakpointValue({
    base: 1,        // Mobile: Single column
    md: 2,          // Tablet: Two columns
    lg: comparison.responses.length <= 2 ? 2 : 3,  // Desktop: 2-3 columns
    xl: Math.min(comparison.responses.length, 4)   // Large: Up to 4 columns
  });

  const sidebarWidth = useBreakpointValue({
    base: 'full',   // Mobile: Full width overlay
    md: '300px',    // Desktop: Fixed sidebar
    lg: '350px'
  });

  const isMobile = useBreakpointValue({ base: true, md: false });

  const sortedResponses = useMemo(() => {
    return [...comparison.responses].sort((a, b) => {
      // Sort by vote score, then by response time
      const aScore = (a.votes?.thumbsUp || 0) - (a.votes?.thumbsDown || 0);
      const bScore = (b.votes?.thumbsUp || 0) - (b.votes?.thumbsDown || 0);
      if (aScore !== bScore) return bScore - aScore;
      return a.responseTime - b.responseTime;
    });
  }, [comparison.responses]);

  return (
    <Flex direction={{ base: 'column', lg: 'row' }} h="full">
      {/* Main comparison area */}
      <Box flex="1" p={4} overflow="auto">
        <SimilarityMetrics 
          metrics={comparison.metrics} 
          compact={isMobile}
        />
        
        <Grid
          templateColumns={`repeat(${gridColumns}, 1fr)`}
          gap={4}
          mt={4}
        >
          {sortedResponses.map((response) => (
            <ResponseCard
              key={response.id}
              response={response}
              isSelected={selectedResponse === response.id}
              onSelect={() => setSelectedResponse(response.id)}
              compact={isMobile}
            />
          ))}
        </Grid>
      </Box>

      {/* Voting sidebar */}
      <Box
        w={sidebarWidth}
        borderLeft={{ base: 'none', lg: '1px solid' }}
        borderColor="gray.200"
        bg="gray.50"
        p={4}
      >
        <VotingInterface
          comparison={comparison}
          selectedResponse={selectedResponse}
          orientation={isMobile ? 'horizontal' : 'vertical'}
        />
      </Box>
    </Flex>
  );
}
```

### 2.5 Data Visualization for Comparisons

```typescript
// components/comparison/SimilarityMetrics.tsx
import { Box, Progress, Text, Tooltip, SimpleGrid } from '@chakra-ui/react';
import { Bar, RadialBar, ResponsiveContainer } from 'recharts';

interface SimilarityMetricsProps {
  metrics: ComparisonMetrics;
  compact?: boolean;
}

export function SimilarityMetrics({ metrics, compact = false }: SimilarityMetricsProps) {
  const metricsData = [
    {
      name: 'Semantic Similarity',
      value: metrics.semantic,
      color: '#4CAF50',
      description: 'How similar the meanings are across responses'
    },
    {
      name: 'Length Consistency',
      value: metrics.length,
      color: '#2196F3',
      description: 'How consistent response lengths are'
    },
    {
      name: 'Sentiment Alignment',
      value: metrics.sentiment,
      color: '#FF9800',
      description: 'How aligned the emotional tones are'
    },
    {
      name: 'Response Speed',
      value: metrics.speed,
      color: '#9C27B0',
      description: 'Relative response times across models'
    }
  ];

  if (compact) {
    return (
      <SimpleGrid columns={2} spacing={3}>
        {metricsData.map((metric) => (
          <Tooltip key={metric.name} label={metric.description}>
            <Box>
              <Text fontSize="sm" mb={1}>{metric.name}</Text>
              <Progress
                value={metric.value}
                colorScheme={getColorScheme(metric.value)}
                size="sm"
              />
              <Text fontSize="xs" color="gray.500">{metric.value}%</Text>
            </Box>
          </Tooltip>
        ))}
      </SimpleGrid>
    );
  }

  return (
    <Box bg="white" p={6} borderRadius="lg" shadow="sm" border="1px solid" borderColor="gray.200">
      <Text fontSize="lg" fontWeight="bold" mb={4}>📊 Comparison Metrics</Text>
      
      <SimpleGrid columns={4} spacing={6}>
        {metricsData.map((metric) => (
          <Box key={metric.name} textAlign="center">
            <Box position="relative" w="80px" h="80px" mx="auto" mb={3}>
              <ResponsiveContainer>
                <RadialBar
                  data={[{ value: metric.value }]}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  fill={metric.color}
                  cornerRadius={10}
                />
              </ResponsiveContainer>
              <Text
                position="absolute"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                fontSize="lg"
                fontWeight="bold"
              >
                {metric.value}%
              </Text>
            </Box>
            <Text fontSize="sm" fontWeight="medium">{metric.name}</Text>
            <Text fontSize="xs" color="gray.500" mt={1}>
              {getScoreDescription(metric.value)}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}

function getColorScheme(value: number): string {
  if (value >= 80) return 'green';
  if (value >= 60) return 'yellow';
  if (value >= 40) return 'orange';
  return 'red';
}

function getScoreDescription(value: number): string {
  if (value >= 80) return 'Excellent';
  if (value >= 60) return 'Good';
  if (value >= 40) return 'Fair';
  return 'Poor';
}
```

---

## 3. USER EXPERIENCE DESIGN

### 3.1 Discord-First Interaction Patterns

```typescript
// Discord UX Principles
const discordUXPatterns = {
  // Immediate feedback pattern
  immediateAcknowledgment: {
    pattern: 'Always acknowledge user commands within 2 seconds',
    implementation: 'Use interaction.deferReply() immediately',
    fallback: 'Show progress indicators and estimated completion time'
  },

  // Progressive disclosure
  progressiveDisclosure: {
    pattern: 'Show summary in Discord, details on web',
    discordView: 'Truncated responses (1024 chars max) with "View Full" button',
    webView: 'Complete responses with advanced analysis tools'
  },

  // Contextual actions
  contextualActions: {
    pattern: 'Provide relevant actions as Discord components',
    voting: 'Immediate thumbs up/down reactions',
    rating: 'Dropdown menus for detailed model ratings',
    sharing: 'Thread creation for team discussions'
  },

  // Error recovery
  errorRecovery: {
    pattern: 'Graceful degradation with clear next steps',
    partialFailure: 'Show successful responses, note failed models',
    completeFailure: 'Provide alternative actions (retry, contact support)',
    userError: 'Suggest corrections with examples'
  }
};
```

### 3.2 Mobile-Responsive Web Dashboard

```scss
// styles/responsive.scss
// Mobile-first responsive breakpoints
$breakpoints: (
  xs: 0,
  sm: 576px,
  md: 768px,
  lg: 992px,
  xl: 1200px,
  xxl: 1400px
);

// Component-specific responsive patterns
.comparison-grid {
  display: grid;
  gap: 1rem;
  
  // Mobile: Single column, stacked
  grid-template-columns: 1fr;
  
  @media (min-width: map-get($breakpoints, sm)) {
    // Tablet: Two columns
    grid-template-columns: repeat(2, 1fr);
  }
  
  @media (min-width: map-get($breakpoints, lg)) {
    // Desktop: Adaptive columns based on response count
    grid-template-columns: repeat(var(--response-count), 1fr);
    max-width: calc(400px * var(--response-count));
  }
}

.response-card {
  // Touch-friendly sizing on mobile
  min-height: 200px;
  padding: 1rem;
  
  @media (max-width: map-get($breakpoints, sm)) {
    // Larger touch targets on mobile
    .vote-buttons {
      min-height: 44px;
      min-width: 44px;
    }
  }
  
  @media (min-width: map-get($breakpoints, lg)) {
    // More compact on desktop
    min-height: 300px;
    padding: 1.5rem;
  }
}
```

### 3.3 Accessibility Standards

```typescript
// utils/accessibility.ts
export const accessibilityConfig = {
  // WCAG 2.1 AA compliance
  colorContrast: {
    normalText: '4.5:1',
    largeText: '3:1',
    nonTextElements: '3:1'
  },

  // Keyboard navigation
  keyboardSupport: {
    tabOrder: 'Logical tab sequence through comparison cards',
    shortcuts: {
      'j/k': 'Navigate between responses',
      'v': 'Vote on selected response',
      'c': 'Copy response content',
      'esc': 'Close modals/overlays'
    }
  },

  // Screen reader support
  ariaLabels: {
    responseCard: (model: string, votes: number) => 
      `Response from ${model}, ${votes} votes`,
    voteButton: (action: string, model: string) =>
      `${action} response from ${model}`,
    similarityScore: (score: number, metric: string) =>
      `${metric} similarity score: ${score} out of 100`
  },

  // Focus management
  focusManagement: {
    modalOpen: 'Focus first interactive element',
    modalClose: 'Return focus to trigger element',
    routeChange: 'Focus main heading'
  }
};

// Accessibility hook
export function useAccessibility() {
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    // Detect user preferences
    const highContrast = window.matchMedia('(prefers-contrast: high)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    setIsHighContrast(highContrast);
    setReduceMotion(reducedMotion);
  }, []);

  return {
    isHighContrast,
    reduceMotion,
    announceToScreenReader: (message: string) => {
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.className = 'sr-only';
      announcement.textContent = message;
      
      document.body.appendChild(announcement);
      setTimeout(() => document.body.removeChild(announcement), 1000);
    }
  };
}
```

### 3.4 Performance Optimizations

```typescript
// Performance optimization strategies
export const performanceConfig = {
  // Code splitting by route
  routing: {
    comparison: () => import('../pages/comparison/[id]'),
    dashboard: () => import('../pages/dashboard'),
    settings: () => import('../pages/settings')
  },

  // Component lazy loading
  components: {
    AnalyticsChart: lazy(() => import('../components/AnalyticsChart')),
    ExportModal: lazy(() => import('../components/ExportModal'))
  },

  // Data fetching optimization
  dataFetching: {
    // SWR configuration for caching
    swr: {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60000, // 1 minute
      errorRetryCount: 3
    },

    // React Query configuration
    reactQuery: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false
    }
  },

  // Virtual scrolling for large lists
  virtualization: {
    historyList: {
      itemHeight: 120,
      overscan: 5,
      threshold: 50 // Start virtualizing after 50 items
    }
  },

  // Image optimization
  images: {
    avatars: {
      sizes: [32, 48, 64, 128],
      formats: ['webp', 'png'],
      loading: 'lazy'
    }
  }
};
```

---

## 4. INTEGRATION PATTERNS

### 4.1 API Client Architecture

```typescript
// lib/api-client.ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

class APIClient {
  private client: AxiosInstance;
  private authToken: string | null = null;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
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
          await this.refreshToken();
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  private async refreshToken() {
    try {
      const response = await this.client.post('/auth/refresh');
      this.setAuthToken(response.data.token);
    } catch (error) {
      // Redirect to login
      window.location.href = '/auth/login';
    }
  }

  // Query methods
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

  async voteOnResponse(responseId: string, vote: Vote): Promise<void> {
    await this.client.post(`/responses/${responseId}/vote`, vote);
  }

  async updateUserSettings(settings: UserSettings): Promise<void> {
    await this.client.put('/user/settings', settings);
  }

  // Error-prone operations with retry logic
  async withRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    
    throw lastError;
  }
}

export const apiClient = new APIClient(process.env.NEXT_PUBLIC_API_URL!);
```

### 4.2 WebSocket Connection Management

```typescript
// lib/websocket.ts
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectInterval: number = 1000;
  private maxReconnectInterval: number = 30000;
  private reconnectDecay: number = 1.5;
  private connectionTimeout: number = 4000;
  private timeoutId?: NodeJS.Timeout;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(private url: string, private authToken: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.url}?token=${this.authToken}`);
        
        this.timeoutId = setTimeout(() => {
          this.ws?.close();
          reject(new Error('Connection timeout'));
        }, this.connectionTimeout);

        this.ws.onopen = () => {
          clearTimeout(this.timeoutId);
          this.reconnectInterval = 1000; // Reset reconnect interval
          console.log('WebSocket connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        };

        this.ws.onclose = (event) => {
          clearTimeout(this.timeoutId);
          console.log('WebSocket disconnected:', event.code);
          
          // Only auto-reconnect for abnormal closures
          if (event.code !== 1000) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(this.timeoutId);
          console.error('WebSocket error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect() {
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect().catch(() => {
        // Increase reconnect interval with exponential backoff
        this.reconnectInterval = Math.min(
          this.reconnectInterval * this.reconnectDecay,
          this.maxReconnectInterval
        );
        this.scheduleReconnect();
      });
    }, this.reconnectInterval);
  }

  private handleMessage(message: any) {
    const { type, data } = message;
    const listeners = this.listeners.get(type);
    
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  on(eventType: string, listener: Function) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  off(eventType: string, listener: Function) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  send(type: string, data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    } else {
      console.warn('WebSocket not connected. Message not sent:', { type, data });
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

### 4.3 Authentication Flow

```typescript
// lib/auth.ts
import { apiClient } from './api-client';
import { WebSocketManager } from './websocket';

export class AuthManager {
  private wsManager: WebSocketManager | null = null;

  async loginWithDiscord(): Promise<User> {
    // Redirect to Discord OAuth
    window.location.href = `/api/auth/discord`;
    
    // This will be called after OAuth callback
    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'DISCORD_AUTH_SUCCESS') {
          window.removeEventListener('message', handleMessage);
          resolve(event.data.user);
        }
      };
      
      window.addEventListener('message', handleMessage);
    });
  }

  async logout(): Promise<void> {
    try {
      await apiClient.client.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state
      this.wsManager?.disconnect();
      this.wsManager = null;
      apiClient.setAuthToken('');
      
      // Clear stored data
      localStorage.removeItem('auth-token');
      localStorage.removeItem('user-data');
      
      // Redirect to login
      window.location.href = '/auth/login';
    }
  }

  async initializeAuth(): Promise<User | null> {
    const token = localStorage.getItem('auth-token');
    const userData = localStorage.getItem('user-data');

    if (!token || !userData) {
      return null;
    }

    try {
      // Verify token is still valid
      apiClient.setAuthToken(token);
      const user = await apiClient.getCurrentUser();
      
      // Initialize WebSocket connection
      this.wsManager = new WebSocketManager(
        process.env.NEXT_PUBLIC_WS_URL!,
        token
      );
      await this.wsManager.connect();

      return user;
    } catch (error) {
      console.error('Auth initialization failed:', error);
      // Clear invalid tokens
      localStorage.removeItem('auth-token');
      localStorage.removeItem('user-data');
      return null;
    }
  }

  getWebSocketManager(): WebSocketManager | null {
    return this.wsManager;
  }
}

export const authManager = new AuthManager();
```

### 4.4 Error Handling and Recovery

```typescript
// lib/error-handling.ts
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorQueue: Array<AppError> = [];
  private maxQueueSize = 50;

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  handleError(error: unknown, context?: string): void {
    const appError = this.normalizeError(error, context);
    
    // Add to error queue
    this.errorQueue.unshift(appError);
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.pop();
    }

    // Log error
    console.error('App Error:', appError);

    // Report to monitoring service
    this.reportError(appError);

    // Show user notification
    this.showUserNotification(appError);

    // Attempt recovery if possible
    this.attemptRecovery(appError);
  }

  private normalizeError(error: unknown, context?: string): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError(error.message, 'UNKNOWN_ERROR', context);
    }

    return new AppError('An unknown error occurred', 'UNKNOWN_ERROR', context);
  }

  private reportError(error: AppError): void {
    // Send to monitoring service (e.g., Sentry)
    if (process.env.NODE_ENV === 'production') {
      // Sentry.captureException(error);
    }
  }

  private showUserNotification(error: AppError): void {
    const message = this.getUserFriendlyMessage(error);
    
    // Show toast notification
    // toast.error(message);
  }

  private getUserFriendlyMessage(error: AppError): string {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'Connection problem. Please check your internet and try again.';
      case 'AUTH_ERROR':
        return 'Session expired. Please log in again.';
      case 'API_ERROR':
        return 'Service temporarily unavailable. Please try again later.';
      case 'RATE_LIMIT_ERROR':
        return 'Too many requests. Please wait a moment and try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  private attemptRecovery(error: AppError): void {
    switch (error.code) {
      case 'AUTH_ERROR':
        // Attempt token refresh
        authManager.refreshToken();
        break;
      case 'WEBSOCKET_ERROR':
        // Attempt reconnection
        const wsManager = authManager.getWebSocketManager();
        wsManager?.connect();
        break;
      case 'NETWORK_ERROR':
        // Retry with exponential backoff
        setTimeout(() => {
          // Retry last failed request
        }, 2000);
        break;
    }
  }

  getRecentErrors(): AppError[] {
    return [...this.errorQueue];
  }

  clearErrors(): void {
    this.errorQueue = [];
  }
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: string,
    public timestamp = new Date()
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = ErrorHandler.getInstance();
```

---

## 5. IMPLEMENTATION ROADMAP

### Phase 1: Core Infrastructure (Weeks 1-2)
- [x] Discord bot basic setup with slash commands
- [x] Next.js application with authentication
- [x] WebSocket connection management
- [x] API client architecture
- [x] Error handling system

### Phase 2: Core Features (Weeks 3-6)
- [x] `/compare` command implementation
- [x] Multi-AI provider integration
- [x] Comparison view components
- [x] Real-time voting system
- [x] Mobile-responsive design

### Phase 3: Advanced Features (Weeks 7-10)
- [x] `/history` and `/settings` commands
- [x] Analytics dashboard
- [x] Advanced similarity metrics
- [x] Export functionality
- [x] Performance optimizations

### Phase 4: Polish & Production (Weeks 11-12)
- [x] Accessibility compliance
- [x] Security hardening
- [x] Load testing and optimization
- [x] Documentation and deployment

This architecture provides a solid foundation for your Multi-AI Query & Comparison Tool, emphasizing Discord-native interactions while providing a powerful web dashboard for detailed analysis. The design prioritizes user experience, performance, and scalability while maintaining clean separation of concerns across all components.