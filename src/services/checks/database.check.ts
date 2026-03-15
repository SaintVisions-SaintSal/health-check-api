/**
 * @file database.check.ts
 * @description Health check probe for the PostgreSQL database dependency.
 *
 * Design principles applied here:
 * - Never throws â all errors are caught and returned as `{ status: 'unhealthy' }`.
 * - Enforces a hard 5-second timeout via `Promise.race` so a hung DB
 *   connection cannot block the health endpoint indefinitely.
 * - Uses the existing singleton pool (no new connections opened per check).
 */

import { getPool } from '../../db/pool';
import { DatabaseCheckResultSchema } from '../../schemas/health.schema';
import type { DatabaseCheckResult } from '../../types/health.types';

/** Timeout in milliseconds applied to each database probe */
const DB_CHECK_TIMEOUT_MS = 5_000;

/**
 * Builds a Promise that rejects after `ms` milliseconds with a descriptive
 * timeout error. Used as the racing leg in `Promise.race`.
 *
 * @param ms - Milliseconds before the promise rejects
 * @returns A promise that always rejects after the given delay
 */
function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Connection timeout after ${ms}ms`));
    }, ms);
    // Allow Node.js to exit even if this timer is still pending
    if (timer.unref) timer.unref();
  });
}

/**
 * Executes a lightweight `SELECT 1` query against the PostgreSQL pool and
 * measures round-trip latency.
 *
 * The client is always released back to the pool â even on error â via a
 * `finally` block to prevent connection leaks.
 *
 * @returns Latency in milliseconds if the query succeeds
 * @throws If the query fails or the client cannot be acquired
 */
async function pingDatabase(): Promise<number> {
  const pool = getPool();
  const start = Date.now();
  const client = await pool.connect();

  try {
    await client.query('SELECT 1');
    return Date.now() - start;
  } finally {
    client.release();
  }
}

/**
 * Runs the database health probe.
 *
 * Races the actual DB ping against a hard timeout. The result is validated
 * through a Zod schema before being returned so callers receive a
 * well-typed, guaranteed-shape object regardless of outcome.
 *
 * **This function never throws.** All failure paths return an
 * `{ status: 'unhealthy' }` result with the error captured in `message`.
 *
 * @returns A `DatabaseCheckResult` describing the current database health
 *
 * @example
 * const result = await checkDatabase();
 * // => { status: 'healthy', latency_ms: 8, message: 'Connection established' }
 * // => { status: 'unhealthy', latency_ms: null, message: 'Connection timeout after 5000ms' }
 */
export async function checkDatabase(): Promise<DatabaseCheckResult> {
  try {
    const latency_ms = await Promise.race([
      pingDatabase(),
      createTimeoutPromise(DB_CHECK_TIMEOUT_MS),
    ]);

    const result: DatabaseCheckResult = {
      status: 'healthy',
      latency_ms,
      message: 'Connection established',
    };

    // Validate shape before returning â catches any unexpected mutations
    return DatabaseCheckResultSchema.parse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown database error';

    const result: DatabaseCheckResult = {
      status: 'unhealthy',
      latency_ms: null,
      message,
    };

    return DatabaseCheckResultSchema.parse(result);
  }
}
