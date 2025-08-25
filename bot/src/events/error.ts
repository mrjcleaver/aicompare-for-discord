import { Events } from 'discord.js';
import { errorLogger } from '../utils/logger';

export default {
  name: Events.Error,
  execute(error: Error) {
    errorLogger.error('Discord client error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  },
};

// Additional error event handlers
export const warn = {
  name: Events.Warn,
  execute(info: string) {
    errorLogger.warn('Discord client warning:', info);
  },
};

export const shardError = {
  name: Events.ShardError,
  execute(error: Error, shardId: number) {
    errorLogger.error(`Shard ${shardId} error:`, {
      error: error.message,
      stack: error.stack,
      shardId,
      timestamp: new Date().toISOString()
    });
  },
};

export const shardReconnecting = {
  name: Events.ShardReconnecting,
  execute(id: number) {
    errorLogger.warn(`Shard ${id} is reconnecting...`);
  },
};