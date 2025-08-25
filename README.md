# Multi-AI Query & Comparison Tool for Discord

A comprehensive Discord bot and web dashboard that enables teams to query multiple AI models simultaneously, compare responses side-by-side, and collaboratively evaluate outputs for informed decision-making.

## Features

### Discord Bot
- **`/compare`** - Query multiple AI models simultaneously (OpenAI GPT-4, Claude-3.5-Sonnet, Gemini-1.5-Pro, Cohere Command-R+)
- **`/history`** - View and search previous comparisons
- **`/settings`** - Configure user preferences and API keys
- **Interactive Voting** - Team members can vote and rate responses
- **Automatic Threads** - Creates discussion threads for each comparison

### Web Dashboard
- **Detailed Comparison View** - Side-by-side response analysis with similarity metrics
- **Real-time Updates** - Live updates via WebSocket connections
- **Analytics Dashboard** - Team and model performance insights
- **Export Features** - Export comparisons in various formats
- **Mobile Responsive** - Optimized for all devices

### AI Model Support
- **OpenAI**: GPT-4, GPT-4-turbo, GPT-3.5-turbo
- **Anthropic**: Claude-3.5-Sonnet, Claude-3-Haiku
- **Google**: Gemini-1.5-Pro, Gemini-1.5-Flash
- **Cohere**: Command-R+, Command-R

## Quick Start

### Prerequisites

- **Node.js** 18.0.0 or higher
- **Docker** and **Docker Compose** (recommended for development)
- **PostgreSQL** 13+ (if not using Docker)
- **Redis** 6+ (if not using Docker)
- **Discord Application** and Bot Token
- **AI API Keys** (OpenAI, Anthropic, Google AI, Cohere)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/aicompare-for-discord.git
   cd aicompare-for-discord
   ```

2. **Set up environment variables**
   ```bash
   # Copy environment templates
   cp .env.example .env.local
   cp bot/.env.example bot/.env.local
   cp web/.env.example web/.env.local
   
   # Edit .env.local files with your configuration
   # See "Environment Configuration" section below for details
   ```

3. **Start with Docker (Recommended)**
   ```bash
   # Start all services
   docker-compose up -d
   
   # Or start with development tools
   docker-compose --profile tools up -d
   ```

4. **Or start manually**
   ```bash
   # Install dependencies for all services
   npm run install:all
   
   # Start database services
   docker-compose up -d postgres redis
   
   # Run database migrations
   npm run db:migrate
   
   # Start all services in development mode
   npm run dev
   ```

### Discord Bot Setup

1. **Create Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to "Bot" section and create a bot
   - Copy the bot token to `DISCORD_TOKEN` in your `.env.local`

2. **Set up OAuth2**
   - Go to "OAuth2" section
   - Copy Client ID and Client Secret to your `.env.local`
   - Add redirect URI: `http://localhost:3000/api/auth/callback/discord`

3. **Invite Bot to Server**
   - Go to "OAuth2 > URL Generator"
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: `Send Messages`, `Create Public Threads`, `Use Slash Commands`, `Add Reactions`
   - Use the generated URL to invite the bot

4. **Deploy Slash Commands**
   ```bash
   # Deploy commands to your test server
   npm run bot:deploy-commands
   ```

## Environment Configuration

### Core Configuration

```bash
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here

# AI API Keys
OPENAI_API_KEY=sk-your_openai_api_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_ai_api_key_here
COHERE_API_KEY=your_cohere_api_key_here

# Database & Cache
DATABASE_URL=postgresql://aicompare_user:dev_password_123@localhost:5432/aicompare
REDIS_URL=redis://localhost:6379

# Security (generate secure random strings)
NEXTAUTH_SECRET=your_nextauth_secret_here_at_least_32_characters_long
JWT_SECRET=your_jwt_secret_here_at_least_32_characters_long
ENCRYPTION_KEY=your_encryption_key_here_exactly_32_characters_long
```

### Getting API Keys

#### OpenAI
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add credits to your account

#### Anthropic
1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Create an account and API key
3. Ensure you have Claude access

#### Google AI
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Enable the Generative AI API

#### Cohere
1. Visit [Cohere Dashboard](https://dashboard.cohere.ai/api-keys)
2. Create an account and API key
3. Choose appropriate plan based on usage

## Development

### Project Structure

```
aicompare-for-discord/
├── bot/                    # Discord bot service
│   ├── src/
│   │   ├── commands/      # Slash command handlers
│   │   ├── events/        # Discord event handlers
│   │   ├── services/      # AI providers & business logic
│   │   └── utils/         # Utility functions
│   └── package.json
├── web/                   # Next.js web dashboard
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Next.js pages & API routes
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Utilities & configurations
│   └── package.json
├── shared/                # Shared types & utilities
├── database/              # Database migrations & seeds
├── infra/                 # Infrastructure configurations
└── docs/                  # Documentation
```

### Available Scripts

#### Root Level
```bash
npm run dev              # Start all services in development mode
npm run build            # Build all services for production
npm run test             # Run all tests
npm run lint             # Lint all codebases
npm run install:all      # Install dependencies for all services
```

#### Bot Service
```bash
npm run bot:dev          # Start bot in development mode
npm run bot:build        # Build bot for production
npm run bot:test         # Run bot tests
npm run bot:deploy-commands  # Deploy slash commands
```

#### Web Dashboard
```bash
npm run web:dev          # Start web dashboard in development mode
npm run web:build        # Build web dashboard for production
npm run web:test         # Run web tests
```

### Database Management

```bash
# Run migrations
npm run db:migrate

# Reset database
npm run db:reset

# Seed database with test data
npm run db:seed

# Generate Prisma client
npm run db:generate
```

## Docker Services

The `docker-compose.yml` provides the following services:

- **postgres**: PostgreSQL database
- **redis**: Redis cache and message queue
- **bot**: Discord bot service
- **web**: Next.js web dashboard
- **pgadmin**: Database management UI (dev profile)
- **redis-commander**: Redis management UI (dev profile)
- **nginx**: Reverse proxy (production profile)

### Docker Commands

```bash
# Start core services
docker-compose up -d

# Start with development tools
docker-compose --profile tools up -d

# Start with production setup
docker-compose --profile production up -d

# View logs
docker-compose logs -f bot web

# Restart a service
docker-compose restart bot

# Stop all services
docker-compose down
```

## Production Deployment

### Environment Setup

1. **Set production environment variables**
   ```bash
   NODE_ENV=production
   DATABASE_URL=your_production_database_url
   REDIS_URL=your_production_redis_url
   NEXTAUTH_URL=https://yourdomain.com
   ```

2. **Use secure secrets**
   - Generate strong, unique values for all secret keys
   - Use environment variable injection or secrets management
   - Never commit production secrets to version control

### Deployment Options

#### Docker Deployment
```bash
# Build production images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Deploy with production profile
docker-compose --profile production up -d
```

#### Manual Deployment
```bash
# Build all services
npm run build

# Start bot service
cd bot && npm start

# Start web service
cd web && npm start
```

### Health Checks

- **Bot Health**: `http://localhost:3001/health`
- **Web Health**: `http://localhost:3000/api/health`
- **Database**: Monitor connection status in logs
- **Redis**: Monitor connection status in logs

## Usage Guide

### Basic Comparison

1. Use `/compare` command in Discord:
   ```
   /compare prompt: "Explain quantum computing" models: "All Models"
   ```

2. Bot will:
   - Acknowledge your request immediately
   - Query all selected AI models in parallel
   - Display results with voting buttons
   - Create a thread for discussion

3. Click "View Details" to see the full comparison on the web dashboard

### Advanced Features

#### Custom Model Selection
```
/compare prompt: "Write a Python function" models: "Custom Selection" temperature: 0.3
```

#### Viewing History
```
/history limit: 10 filter: "python"
```

#### Configuring Settings
```
/settings models    # Set default model preferences
/settings apikeys   # Manage your API keys (DM only)
```

### Web Dashboard Features

- **Comparison Details**: Full responses with diff highlighting
- **Similarity Metrics**: Semantic similarity, length consistency, sentiment alignment
- **Team Analytics**: Usage patterns, model performance, cost analysis
- **Export Options**: PDF reports, CSV data, JSON exports

## API Documentation

### REST API Endpoints

```
GET    /api/comparisons          # Get comparison history
POST   /api/comparisons          # Create new comparison
GET    /api/comparisons/:id      # Get specific comparison
POST   /api/responses/:id/vote   # Vote on a response
GET    /api/analytics            # Get analytics data
```

### WebSocket Events

```javascript
// Client events
{
  "type": "comparison_update",
  "data": { "id": "uuid", "status": "completed" }
}

{
  "type": "vote_update", 
  "data": { "responseId": "uuid", "votes": {...} }
}
```

## Monitoring & Logging

### Log Levels
- **error**: Critical errors requiring immediate attention
- **warn**: Warning conditions that should be reviewed
- **info**: General operational information
- **debug**: Detailed diagnostic information (development only)

### Health Monitoring

Monitor these key metrics:
- Response times for AI queries
- Database connection status
- Redis connection status
- Memory usage and CPU utilization
- Error rates by service

## Security

### API Key Security
- All API keys are encrypted at rest using AES-256-GCM
- Keys are decrypted only when making API calls
- Per-user encryption with salted keys
- Regular key rotation recommended

### Access Control
- Discord OAuth for authentication
- Role-based permissions
- Rate limiting on all endpoints
- Input validation and sanitization

### Data Privacy
- User data retention policies
- GDPR compliance options
- Data anonymization features
- Secure deletion capabilities

## Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make changes** and add tests
4. **Commit changes**: `git commit -m 'Add amazing feature'`
5. **Push to branch**: `git push origin feature/amazing-feature`
6. **Create Pull Request**

### Code Style

- **TypeScript**: Strict typing required
- **ESLint**: Follows Airbnb configuration
- **Prettier**: Automatic code formatting
- **Tests**: Jest for unit tests, Cypress for E2E

## Troubleshooting

### Common Issues

#### Bot Not Responding
1. Check Discord token validity
2. Verify bot permissions in server
3. Ensure slash commands are deployed
4. Check bot logs for errors

#### Database Connection Errors
1. Verify PostgreSQL is running
2. Check DATABASE_URL format
3. Ensure database exists and user has permissions
4. Check firewall/network connectivity

#### AI API Errors
1. Verify API key validity and quotas
2. Check rate limiting status
3. Monitor API provider status pages
4. Review request/response logs

#### Performance Issues
1. Monitor database query performance
2. Check Redis connection and memory usage
3. Review AI API response times
4. Monitor system resources (CPU, memory, disk)

### Getting Help

- **Documentation**: Check the `/docs` directory
- **Issues**: Create GitHub issues for bugs
- **Discussions**: Use GitHub Discussions for questions
- **Discord**: Join our development Discord server

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Discord.js community for excellent documentation
- AI providers for robust API services  
- Open source contributors and maintainers
- Beta testers and early adopters

---

**Built with ❤️ for the AI comparison community**