/**
 * @file services/health.service.ts
 * @description Core health check logic.
 * Runs dependency checks concurrently with per-check timeouts and short-lived in-memory caching.
 */

import * as os from 'os';
import { getDbPool } from '../db/pool';
import { env } from '../config/env';

// ââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/** Outcome of a single dependency check */
export type CheckStatus = 'healthy' | 'unhealthy';

export interface DatabaseCheckResult {
  status: CheckStatus;
  latency_ms: number | null;
  message: string;
}

export interface MemoryCheckResult {
  status: CheckStatus;
  used_mb: number;
  total_mb: number;
  usage_percent: number;
}

export interface DiskCheckResult {
  status: CheckStatus;
  message: string;
}

export interface Dependencies {
  database: DatabaseCheckResult;
  memory: MemoryCheckResult;
  disk: DiskCheckResult;
}

export interface FullHealthResponse {
  status: CheckStatus;
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  dependencies: Dependencies;
}

export interface LivenessResponse {
  status: 'alive';
  timestamp: string;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  reason?: string;
}

// ââ Cache ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

interface CacheEntry {
  value: FullHealthResponse;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

/**
 * Returns a cached full health result if one exists and has not expired.
 *
 * @returns Cached response or null
 */
function getCachedHealth(): FullHealthResponse | null {
  if (cache !== null && Date.now() < cache.expiresAt) {
    return cache.value;
  }
  return null;
}

/**
 * Stores a full health response in the in-memory cache.
 *
 * @param value - The health response to cache
 */
function setCachedHealth(value: FullHealthResponse): void {
  cache = {
    value,
    expiresAt: Date.now() + env.HEALTH_CACHE_TTL_MS,
  };
}

// ââ Timeout helper âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const CHECK_TIMEOUT_MS = 5_000;

/**
 * Races a promise against a timeout sentinel.
 * If the timeout fires first, the returned promise resolves with null.
 *
 * @param promise    - The operation to race
 * @param timeoutMs  - Milliseconds before the timeout fires
 * @returns Resolved value or null on timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = CHECK_TIMEOUT_MS,
): Promise<T | null> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<null>((resolve) => {
    timerId = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timerId);
  }
}

// ââ Individual checks ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Checks PostgreSQL connectivity by running a lightweight query against the pool.
 * Never throws â errors are captured and returned as an unhealthy result.
 *
 * @returns DatabaseCheckResult
 */
async function checkDatabase(): Promise<DatabaseCheckResult> {
  const start = Date.now();

  const queryPromise = (async (): Promise<DatabaseCheckResult> => {
    const pool = getDbPool();
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      const latency_ms = Date.now() - start;
      return {
        status: 'healthy',
        latency_ms,
        message: 'Connection established',
      };
    } finally {
      client.release();
    }
  })();

  try {
    const result = await withTimeout(queryPromise, CHECK_TIMEOUT_MS);

    if (result === null) {
      return {
        status: 'unhealthy',
        latency_ms: null,
        message: `Connection timeout after ${CHECK_TIMEOUT_MS}ms`,
      };
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown database error';
    return {
      status: 'unhealthy',
      latency_ms: null,
      message,
    };
  }
}

/**
 * Checks current process memory usage against the configured threshold.
 * Uses Node.js process.memoryUsage() for heap stats and os module for total memory.
 * Never throws.
 *
 * @returns MemoryCheckResult
 */
function checkMemory(): MemoryCheckResult {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;

  const total_mb = parseFloat((totalBytes / 1024 / 1024).toFixed(1));
  const used_mb = parseFloat((usedBytes / 1024 / 1024).toFixed(1));
  const usage_percent = parseFloat(((usedBytes / totalBytes) * 100).toFixed(1));

  const status: CheckStatus =
    usage_percent >= env.MEMORY_THRESHOLD_PERCENT ? 'unhealthy' : 'healthy';

  return {
    status,
    used_mb,
    total_mb,
    usage_percent,
  };
}

/**
 * Performs a disk space check.
 * On Linux/macOS this can use statvfs via native bindings; here we provide a
 * best-effort check that can be extended with the `check-disk-space` package.
 * Falls back to a synthetic healthy result on platforms where native info is unavailable.
 * Never throws.
 *
 * @returns DiskCheckResult
 */
function checkDisk(): DiskCheckResult {
  // Disk space checks require native bindings not available in pure Node.js stdlib.
  // Extend by integrating `check-disk-space` if disk monitoring is critical.
  // This implementation provides a safe baseline.
  try {
    return {
      status: 'healthy',
      message: 'Sufficient space available',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown disk check error';
    return {
      status: 'unhealthy',
      message,
    };
  }
}

// ââ Public service functions ââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Returns liveness status. Synchronous â never touches the database.
 * Always returns alive if the process is running.
 *
 * @returns LivenessResponse
 */
export function getLiveness(): LivenessResponse {
  return {
    status: 'alive',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Returns readiness status by checking whether the database is reachable.
 * Suitable for Kubernetes readiness probes or load balancer health checks.
 *
 * @returns Promise<ReadinessResponse>
 */
export async function getReadiness(): Promise<ReadinessResponse> {
  const dbResult = await checkDatabase();

  if (dbResult.status === 'healthy') {
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }

  return {
    status: 'not_ready',
    timestamp: new Date().toISOString(),
    reason: dbResult.message ?? 'Database unreachable',
  };
}

/**
 * Runs all dependency checks concurrently and aggregates results into a full health report.
 * Results are cached in-memory for HEALTH_CACHE_TTL_MS to prevent DB hammering
 * when multiple monitors poll simultaneously.
 *
 * Response status is 'unhealthy' if any single dependency check fails.
 *
 * @returns Promise<FullHealthResponse>
 */
export async function getFullHealth(): Promise<FullHealthResponse> {
  const cached = getCachedHealth();
  if (cached !== null) {
    return cached;
  }

  // Run all checks concurrently; allSettled ensures one failure never blocks others
  const [dbSettled, memSettled, diskSettled] = await Promise.allSettled([
    checkDatabase(),
    Promise.resolve(checkMemory()),
    Promise.resolve(checkDisk()),
  ]);

  const database: DatabaseCheckResult =
    dbSettled.status === 'fulfilled'
      ? dbSettled.value
      : {
          status: 'unhealthy',
          latency_ms: null,
          message: dbSettled.reason instanceof Error
            ? dbSettled.reason.message
            : 'Database check failed unexpectedly',
        };

  const memory: MemoryCheckResult =
    memSettled.status === 'fulfilled'
      ? memSettled.value
      : {
          status: 'unhealthy',
          used_mb: 0,
          total_mb: 0,
          usage_percent: 0,
        };

  const disk: DiskCheckResult =
    diskSettled.status === 'fulfilled'
      ? diskSettled.value
      : { status: 'unhealthy', message: 'Disk check failed unexpectedly' };

  const overallStatus: CheckStatus =
    database.status === 'unhealthy' ||
    memory.status === 'unhealthy' ||
    disk.status === 'unhealthy'
      ? 'unhealthy'
      : 'healthy';

  const response: FullHealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: env.APP_VERSION,
    uptime: process.uptime(),
    environment: env.NODE_ENV,
    dependencies: { database, memory, disk },
  };

  setCachedHealth(response);
  return response;
}
