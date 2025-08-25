# AI Compare Backend

Backend API server for the Multi-AI Query & Comparison Tool - a Discord-native platform for querying and comparing multiple AI models simultaneously.

## Features

### Core Functionality
- **Multi-LLM Integration**: Support for OpenAI GPT, Claude, Gemini, and Cohere models
- **Parallel Query Execution**: Execute queries across multiple models simultaneously
- **Real-time Updates**: WebSocket integration for live query progress and results
- **Voting & Collaboration**: Team-based voting and commenting on AI responses
- **Similarity Analysis**: Automated comparison metrics between responses

### Technical Stack
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with comprehensive middleware
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis for caching and job queues
- **Authentication**: Discord OAuth 2.0
- **Real-time**: Socket.IO WebSocket server
- **Security**: Rate limiting, encryption, audit logging

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Discord Application (for OAuth)

### Environment Setup

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Configure your environment variables:
```bash
# Server Configuration
PORT=3001
NODE_ENV=development
API_BASE_URL=http://localhost:3001

# Database
DATABASE_URL="postgresql://username:password@localhost:5432/aicompare?schema=public"

# Redis
REDIS_URL=redis://localhost:6379

# Encryption & JWT
ENCRYPTION_KEY=your-32-character-encryption-key-here
JWT_SECRET=your-jwt-secret-key-here

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_REDIRECT_URI=http://localhost:3001/auth/discord/callback

# API Keys (System-level fallbacks)
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
GOOGLE_API_KEY=your-google-ai-key
COHERE_API_KEY=your-cohere-key
```

### Installation & Development

1. Install dependencies:
```bash
npm install
```

2. Set up the database:
```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Or run migrations (for production)
npm run db:migrate
```

3. Start development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3001`

## Docker Deployment

### Development with Docker Compose

1. Build and start all services:
```bash
docker-compose up --build
```

This starts:
- API server on port 3001
- PostgreSQL on port 5432
- Redis on port 6379
- Queue worker for background processing

### Production Deployment

1. Use the production profile:
```bash
docker-compose --profile production up -d
```

This additionally starts:
- Nginx reverse proxy on ports 80/443
- Optional monitoring with Prometheus & Grafana

## API Documentation

### Authentication
All API endpoints (except `/health` and `/auth`) require authentication via JWT Bearer token.

```bash
# Login via Discord OAuth
GET /auth/discord

# Get current user info
GET /api/auth/me
Authorization: Bearer <jwt_token>
```

### Core Endpoints

#### Queries
```bash
# Create new comparison query
POST /api/queries
{
  "prompt": "Explain quantum computing",
  "teamId": "team-uuid",
  "models": ["gpt-4", "claude-3.5-sonnet"],
  "parameters": {
    "temperature": 0.7,
    "maxTokens": 1000
  }
}

# Get query details with responses
GET /api/queries/{queryId}

# Get query history
GET /api/queries?teamId={teamId}&limit=10
```

#### Voting
```bash
# Vote on a response
POST /api/votes
{
  "responseId": "response-uuid",
  "voteType": "THUMBS_UP",
  "value": 1
}

# Get vote summary
GET /api/votes/summary/{responseId}
```

#### Settings
```bash
# Update user preferences
PUT /api/settings/user
{
  "defaultModels": ["gpt-4", "claude-3.5-sonnet"],
  "displayFormat": "detailed"
}

# Add API key
PUT /api/settings/api-keys
{
  "provider": "openai",
  "apiKey": "sk-your-key"
}
```

### WebSocket Events

Connect to WebSocket server for real-time updates:

```javascript
const socket = io('ws://localhost:3001', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Join a query room for live updates
socket.emit('join_query', { queryId: 'query-uuid' });

// Listen for events
socket.on('query_update', (data) => {
  console.log('Query progress:', data);
});

socket.on('response_received', (data) => {
  console.log('New response:', data);
});

socket.on('comparison_complete', (data) => {
  console.log('Comparison results:', data);
});
```

## Architecture Overview

### Services Architecture
```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Express API   │────│    Redis     │────│   Queue Worker │
│                 │    │   (Cache &   │    │   (Background   │
│  - Routes       │    │   Queues)    │    │   Processing)   │
│  - Middleware   │    └──────────────┘    └─────────────────┘
│  - WebSocket    │              │
└─────────────────┘              │
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   LLM Services  │
│                 │    │                 │
│  - User Data    │    │  - OpenAI       │
│  - Queries      │    │  - Anthropic    │
│  - Responses    │    │  - Google       │
│  - Votes        │    │  - Cohere       │
└─────────────────┘    └─────────────────┘
```

### Key Components

1. **LLM Service**: Manages all AI provider integrations with parallel execution
2. **Similarity Service**: Calculates semantic similarity and comparison metrics
3. **WebSocket Service**: Handles real-time updates and team collaboration
4. **Queue Service**: Processes background jobs (queries, similarity calculations)
5. **Database Service**: Prisma-based data layer with audit logging
6. **Authentication**: Discord OAuth with JWT tokens
7. **Rate Limiting**: Redis-backed distributed rate limiting

## Development

### Database Operations

```bash
# View database in browser
npm run db:studio

# Reset database (development only)
npm run db:push --force-reset

# Generate new migration
npm run db:migrate
```

### Queue Management

The system uses Bull queues for background processing:

- `llm-queries`: Parallel LLM query execution
- `similarity-calculations`: Response comparison metrics  
- `notifications`: User notifications
- `cleanup`: Scheduled data cleanup

Monitor queues via Redis CLI or queue dashboard.

### Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run linting
npm run lint
```

### Monitoring

#### Health Checks
- `GET /health` - Basic health check
- `GET /health/detailed` - Comprehensive system status
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

#### Metrics
- `GET /health/metrics` - Prometheus-compatible metrics
- Built-in performance monitoring
- Audit logging for security events

## Production Considerations

### Security
- API key encryption with AES-256-GCM
- Rate limiting on all endpoints
- Request validation with Joi schemas
- Audit logging for all sensitive operations
- CORS configuration for frontend domains

### Performance
- Redis caching for query results
- Database indexes for fast queries
- Background job processing
- Connection pooling
- Response compression

### Scaling
- Horizontal scaling support
- Load balancer ready (sticky sessions for WebSocket)
- Database connection pooling
- Queue-based architecture for heavy processing

### Monitoring
- Health check endpoints
- Prometheus metrics
- Structured logging
- Error tracking with stack traces
- Performance monitoring

## Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | 3001 | No |
| `NODE_ENV` | Environment | development | No |
| `DATABASE_URL` | PostgreSQL connection | - | Yes |
| `REDIS_URL` | Redis connection | redis://localhost:6379 | No |
| `JWT_SECRET` | JWT signing key | - | Yes |
| `ENCRYPTION_KEY` | API key encryption | - | Yes |
| `DISCORD_CLIENT_ID` | Discord OAuth client ID | - | Yes |
| `DISCORD_CLIENT_SECRET` | Discord OAuth secret | - | Yes |
| `OPENAI_API_KEY` | OpenAI API key | - | No* |
| `ANTHROPIC_API_KEY` | Anthropic API key | - | No* |
| `GOOGLE_API_KEY` | Google AI API key | - | No* |
| `COHERE_API_KEY` | Cohere API key | - | No* |

*At least one LLM provider API key is required for system functionality.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run linting and tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details