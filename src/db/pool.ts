/**
 * @file pool.ts
 * @description Singleton PostgreSQL connection pool.
 *
 * The pool is initialised once at application startup via `initPool()` and
 * accessed everywhere else via `getPool()`. Keeping a single pool instance
 * prevents connection-limit exhaustion and avoids the overhead of creating
 * new TCP connections on every health check.
 */

import { Pool, type PoolConfig } from 'pg';
import { DatabaseEnvSchema } from '../schemas/health.schema';

/** Module-level singleton â intentionally `null` until `initPool` is called */
let _pool: Pool | null = null;

/**
 * Parses and validates database-related environment variables using Zod.
 * Throws a `ZodError` (with a descriptive message) if any variable is missing
 * or invalid. Called internally by `initPool`.
 *
 * @returns Validated database configuration object
 * @throws {Error} If required env vars are absent or malformed
 */
function parseDatabaseEnv(): PoolConfig {
  const parsed = DatabaseEnvSchema.parse(process.env);

  return {
    connectionString: parsed.DATABASE_URL,
    max: parsed.DB_POOL_MAX,
    idleTimeoutMillis: parsed.DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: parsed.DB_CONNECT_TIMEOUT_MS,
    // Surface full errors in non-production environments
    ssl:
      process.env['NODE_ENV'] === 'production'
        ? { rejectUnauthorized: true }
        : undefined,
  };
}

/**
 * Initialises the singleton PostgreSQL connection pool.
 *
 * Must be called **once** during application startup before any request
 * handler attempts to use the pool. Subsequent calls are no-ops and return
 * the already-initialised pool.
 *
 * @returns The initialised `Pool` instance
 * @throws {Error} If DATABASE_URL or pool settings are invalid
 *
 * @example
 * // In your app entry point
 * import { initPool } from './db/pool';
 * const pool = initPool();
 */
export function initPool(): Pool {
  if (_pool !== null) {
    return _pool;
  }

  const config = parseDatabaseEnv();
  _pool = new Pool(config);

  // Log unexpected pool-level errors (e.g. idle-client errors) without crashing
  _pool.on('error', (err: Error) => {
    console.error('[db/pool] Unexpected pool error:', err.message);
  });

  console.info('[db/pool] PostgreSQL connection pool initialised');
  return _pool;
}

/**
 * Returns the existing singleton pool instance.
 *
 * @returns The active `Pool` instance
 * @throws {Error} If `initPool()` has not been called prior to this
 *
 * @example
 * import { getPool } from './db/pool';
 * const pool = getPool();
 * const client = await pool.connect();
 */
export function getPool(): Pool {
  if (_pool === null) {
    throw new Error(
      '[db/pool] Pool has not been initialised. Call initPool() at application startup.'
    );
  }
  return _pool;
}

/**
 * Gracefully drains and closes all connections in the pool.
 *
 * Should be called during application shutdown (e.g. SIGTERM handler) to
 * allow in-flight queries to complete before the process exits.
 *
 * @returns Promise that resolves once all connections are closed
 *
 * @example
 * process.on('SIGTERM', async () => {
 *   await closePool();
 *   process.exit(0);
 * });
 */
export async function closePool(): Promise<void> {
  if (_pool === null) {
    return;
  }

  try {
    await _pool.end();
    _pool = null;
    console.info('[db/pool] PostgreSQL connection pool closed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[db/pool] Error while closing pool:', message);
    throw err;
  }
}
