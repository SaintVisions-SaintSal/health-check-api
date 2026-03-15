/**
 * @file memory.check.ts
 * @description Health check probe for Node.js process memory usage.
 *
 * Uses `process.memoryUsage()` (synchronous, zero I/O) to retrieve heap
 * statistics. Reports `unhealthy` when heap usage exceeds the configurable
 * threshold defined by `MEMORY_THRESHOLD_PERCENT`.
 *
 * Design principles applied here:
 * - Never throws â errors return `{ status: 'unhealthy' }`.
 * - Reads config from validated env vars, with a safe fallback default.
 * - Validates the outbound result through Zod before returning.
 */

import { HealthEnvSchema } from '../../schemas/health.schema';
import type { MemoryCheckResult } from '../../types/health.types';
import { MemoryCheckResultSchema } from '../../schemas/health.schema';

/** Bytes â Megabytes conversion divisor */
const BYTES_PER_MB = 1_048_576; // 1024 * 1024

/**
 * Reads the `MEMORY_THRESHOLD_PERCENT` environment variable.
 * Falls back to `90` if the env var is absent or cannot be parsed,
 * ensuring the check degrades gracefully rather than crashing.
 *
 * @returns Threshold as a number in the range [1, 100]
 */
function getMemoryThreshold(): number {
  try {
    const parsed = HealthEnvSchema.pick({ MEMORY_THRESHOLD_PERCENT: true }).parse(
      process.env
    );
    return parsed.MEMORY_THRESHOLD_PERCENT;
  } catch {
    return 90;
  }
}

/**
 * Runs the memory health probe against the current Node.js process.
 *
 * Heap statistics are derived from `process.memoryUsage()`. Total heap
 * size (`heapTotal`) is used as the denominator; `heapUsed` as the
 * numerator. This gives a realistic picture of GC pressure without
 * requiring any native add-ons.
 *
 * **This function never throws.** All failure paths return an
 * `{ status: 'unhealthy' }` result with the error captured in `message`.
 *
 * @returns A `MemoryCheckResult` describing current heap utilisation
 *
 * @example
 * const result = await checkMemory();
 * // => { status: 'healthy', used_mb: 45.2, total_mb: 512, usage_percent: 8.8 }
 * // => { status: 'unhealthy', used_mb: 480.1, total_mb: 512, usage_percent: 93.8, message: 'Memory usage critical: 93.8%' }
 */
export async function checkMemory(): Promise<MemoryCheckResult> {
  try {
    const threshold = getMemoryThreshold();
    const { heapUsed, heapTotal } = process.memoryUsage();

    const used_mb = Math.round((heapUsed / BYTES_PER_MB) * 100) / 100;
    const total_mb = Math.round((heapTotal / BYTES_PER_MB) * 100) / 100;

    // Guard against a zero heapTotal to prevent division-by-zero
    const usage_percent =
      total_mb > 0
        ? Math.round((used_mb / total_mb) * 10_000) / 100 // two decimal places
        : 0;

    const isUnhealthy = usage_percent >= threshold;

    const result: MemoryCheckResult = {
      status: isUnhealthy ? 'unhealthy' : 'healthy',
      used_mb,
      total_mb,
      usage_percent,
      ...(isUnhealthy && {
        message: `Memory usage critical: ${usage_percent}% (threshold: ${threshold}%)`,
      }),
    };

    return MemoryCheckResultSchema.parse(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to read memory statistics';

    const fallback: MemoryCheckResult = {
      status: 'unhealthy',
      used_mb: 0,
      total_mb: 0,
      usage_percent: 0,
      message,
    };

    return MemoryCheckResultSchema.parse(fallback);
  }
}
