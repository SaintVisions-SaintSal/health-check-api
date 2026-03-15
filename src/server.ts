/**
 * @file server.ts
 * @description Application entry point. Initializes DB pool and starts HTTP server.
 */

import 'dotenv/config';
import { createApp } from './app';
import { env } from './config/env';
import { initDbPool, closeDbPool } from './db/pool';

/**
 * Bootstraps and starts the HTTP server.
 * Initializes the database connection pool before accepting traffic.
 */
async function main(): Promise<void> {
  try {
    await initDbPool();
    console.log('[server] Database pool initialized');
  } catch (err) {
    console.error('[server] Failed to initialize database pool:', err);
    // Allow server to start â health endpoint will report DB as unhealthy
  }

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`[server] Listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[server] ${signal} received â shutting down gracefully`);
    server.close(async () => {
      try {
        await closeDbPool();
        console.log('[server] Database pool closed');
      } catch (err) {
        console.error('[server] Error closing database pool:', err);
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
