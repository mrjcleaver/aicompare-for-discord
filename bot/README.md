# AI Compare Discord Bot

A powerful Discord bot for comparing responses from multiple AI models (OpenAI, Anthropic, Google, and Cohere) with interactive voting, similarity analysis, and team collaboration features.

## Features

- **Multi-AI Comparison**: Query up to 4 AI models simultaneously
- **Slash Commands**: `/compare`, `/history`, `/settings`
- **Interactive Voting**: Vote on responses with thumbs up/down and star ratings
- **Similarity Analysis**: Automated metrics for semantic similarity, length consistency, and sentiment alignment
- **Thread Creation**: Automatic discussion threads for each comparison
- **Rich Embeds**: Beautiful Discord embeds with comprehensive information
- **Caching & Performance**: Redis caching for optimal performance
- **Database Integration**: PostgreSQL for persistent data storage
- **Error Handling**: Comprehensive error handling and logging
- **Rate Limiting**: Built-in rate limiting and cooldowns

## Supported AI Models

### OpenAI
- GPT-4
- GPT-4 Turbo
- GPT-3.5 Turbo

### Anthropic
- Claude-3.5 Sonnet
- Claude-3 Haiku

### Google
- Gemini 1.5 Pro
- Gemini 1.5 Flash

### Cohere
- Command R+
- Command R

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Redis 6+
- Discord Bot Application
- API keys for AI providers

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   # Make sure PostgreSQL is running
   # The schema will be automatically created on first run
   ```

5. **Deploy slash commands**
   ```bash
   npm run deploy-commands
   ```

6. **Start the bot**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm run build
   npm start
   ```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Discord bot token | Yes |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes |
| `GOOGLE_API_KEY` | Google AI API key | No |
| `COHERE_API_KEY` | Cohere API key | No |
| `ENCRYPTION_KEY` | 32-character key for encrypting API keys | Yes |
| `NODE_ENV` | Environment (development/production) | No |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | No |

## Usage

### Basic Commands

#### `/compare`
Compare AI model responses to your prompt.

**Parameters:**
- `prompt` (required): Your query for the AI models
- `models` (optional): Model selection preset
- `temperature` (optional): Creativity level (0.0-1.0)
- `max_tokens` (optional): Maximum response length
- `system_prompt` (optional): Additional instructions

**Example:**
```
/compare prompt: "Explain quantum computing in simple terms"
```

#### `/history`
View your previous AI comparisons.

**Parameters:**
- `limit` (optional): Number of results (1-25)
- `filter` (optional): Filter by time period or status
- `models` (optional): Filter by model provider
- `shared` (optional): Show server-wide results

**Example:**
```
/history limit: 10 filter: last_week
```

#### `/settings`
Configure your preferences.

**Subcommands:**
- `models`: Set default model preferences
- `notifications`: Configure notification settings
- `display`: Customize result display
- `apikeys`: Manage API keys (DM only)
- `server`: Server settings (admin only)
- `export`: Export your data
- `reset`: Reset to defaults

**Example:**
```
/settings models preset: creative
```

### Interactive Features

After running a comparison, you can:

1. **Vote** with 👍/👎 buttons
2. **View Details** for comprehensive analysis
3. **Start Discussion** to create a thread
4. **Rate Models** individually
5. **Export Data** as JSON

## Architecture

### Core Components

- **Commands**: Slash command handlers (`/src/commands/`)
- **Events**: Discord event handlers (`/src/events/`)
- **Services**: Business logic and integrations (`/src/services/`)
- **AI Providers**: Individual AI service integrations (`/src/services/ai-providers/`)
- **Utils**: Utility functions and helpers (`/src/utils/`)
- **Database**: PostgreSQL schema and operations (`/src/database/`)

### Key Services

- **AI Manager**: Orchestrates parallel AI queries
- **Query Service**: Handles comparison creation and retrieval
- **Settings Service**: Manages user and server preferences
- **Interaction Handler**: Processes button and menu interactions
- **Database Service**: PostgreSQL operations with connection pooling
- **Redis Service**: Caching and session management

### Database Schema

The bot uses PostgreSQL with the following main tables:
- `users`: Discord user information and settings
- `teams`: Discord server/guild information
- `queries`: Comparison requests and metadata
- `responses`: AI model responses
- `votes`: User votes and ratings
- `similarity_metrics`: Automated analysis results

## Development

### Project Structure

```
bot/
├── src/
│   ├── commands/          # Slash commands
│   ├── events/            # Discord events
│   ├── services/          # Business logic
│   │   └── ai-providers/  # AI integrations
│   ├── utils/             # Utilities
│   ├── database/          # Database schema
│   ├── types/             # TypeScript types
│   └── config/            # Configuration
├── dist/                  # Compiled JavaScript
└── package.json
```

### Adding New AI Providers

1. Create a new provider class extending `BaseAIProvider`
2. Implement the required methods (`query`, `validateConfig`, etc.)
3. Add the provider to `AIServiceManager`
4. Update model configurations in `config/index.ts`

### Testing

```bash
# Run tests (when implemented)
npm test

# Lint code
npm run lint

# Type checking
npx tsc --noEmit
```

### Deployment

1. **Environment Setup**
   - Set `NODE_ENV=production`
   - Use proper SSL certificates for database connections
   - Configure proper logging levels

2. **Database Migration**
   - Ensure PostgreSQL is accessible
   - Schema is automatically created on first run
   - Consider running manual backups

3. **Monitoring**
   - Monitor logs for errors
   - Set up alerts for critical failures
   - Monitor database and Redis performance

## Error Handling

The bot includes comprehensive error handling:

- **Graceful Degradation**: Failed AI providers don't break the entire comparison
- **User-Friendly Messages**: Clear error messages for users
- **Logging**: Detailed logging for debugging
- **Retry Logic**: Automatic retries with exponential backoff
- **Rate Limiting**: Prevents abuse and API quota issues

## Security

- **API Key Encryption**: User API keys are encrypted at rest
- **Input Validation**: All user inputs are validated and sanitized
- **Rate Limiting**: Per-user and per-server limits
- **Permission Checks**: Proper Discord permission validation
- **Audit Logging**: Security events are logged

## Performance

- **Redis Caching**: Query results and user settings cached
- **Database Optimization**: Proper indexing and connection pooling
- **Parallel Processing**: AI queries run concurrently
- **Memory Management**: Efficient memory usage patterns

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
1. Check the logs for error details
2. Review the configuration
3. Open an issue on GitHub with relevant details

---

**Note**: This bot processes user queries through multiple AI providers. Always respect the terms of service of each AI provider and ensure proper usage limits.