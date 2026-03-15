/**
 * @file disk.check.ts
 * @description Health check probe for available disk space.
 *
 * Uses Node.js built-in `fs.statfs` (Node 20+) to read filesystem
 * statistics for the process working directory. Reports `unhealthy`
 * when free space falls below a hardcoded 10 % threshold.
 *
 * Design principles applied here:
 * - Never throws â all errors return `{ status: 'unhealthy' }`.
 * - Uses the async `fs/promises` API exclusively.
 * - Validates the outbound result through Zod before returning.
 *
 * Note: `fs.statfs` is available from Node.js 19.6 / 20.0 onwards.
 * If targeting an older runtime, swap the implementation for a call
 * to `statvfs` via a native add-on or the `check-disk-space` package.
 */

import { statfs } from 'node:fs/promises';
import type { DiskCheckResult } from '../../types/health.types';
import { DiskCheckResultSchema } from '../../schemas/health.schema';

/**
 * Percentage of total disk space that must remain free for the check
 * to be considered healthy. Configurable here as a module constant;
 * promote to an env var if runtime tunability is required.
 */
const FREE_SPACE_THRESHOLD_PERCENT = 10;

/**
 * Directory probed for disk statistics.
 * Defaults to the current working directory of the Node process.
 */
const PROBE_PATH = process.cwd();

/**
 * Runs the disk space health probe.
 *
 * Reads filesystem block statistics for `PROBE_PATH` and calculates the
 * percentage of space currently free. Returns `unhealthy` when available
 * space drops below `FREE_SPACE_THRESHOLD_PERCENT`.
 *
 * **This function never throws.** All failure paths return an
 * `{ status: 'unhealthy' }` result with the error captured in `message`.
 *
 * @returns A `DiskCheckResult` describing current disk space availability
 *
 * @example
 * const result = await checkDisk();
 * // => { status: 'healthy', message: 'Sufficient space available (72.3% free)' }
 * // => { status: 'unhealthy', message: 'Low disk space: 4.1% free (threshold: 10%)' }
 */
export async function checkDisk(): Promise<DiskCheckResult> {
  try {
    const stats = await statfs(PROBE_PATH);

    const { blocks, bfree, bsize } = stats;

    // Guard against degenerate filesystem reports
    if (blocks === 0 || bsize === 0) {
      const result: DiskCheckResult = {
        status: 'unhealthy',
        message: 'Unable to determine disk capacity: filesystem reported zero blocks',
      };
      return DiskCheckResultSchema.parse(result);
    }

    const totalBytes = blocks * bsize;
    const freeBytes = bfree * bsize;
    const freePercent = Math.round((freeBytes / totalBytes) * 10_000) / 100;

    const isUnhealthy = freePercent < FREE_SPACE_THRESHOLD_PERCENT;

    const result: DiskCheckResult = {
      status: isUnhealthy ? 'unhealthy' : 'healthy',
      message: isUnhealthy
        ? `Low disk space: ${freePercent}% free (threshold: ${FREE_SPACE_THRESHOLD_PERCENT}%)`
        : `Sufficient space available (${freePercent}% free)`,
    };

    return DiskCheckResultSchema.parse(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to read disk statistics';

    const fallback: DiskCheckResult = {
      status: 'unhealthy',
      message,
    };

    return DiskCheckResultSchema.parse(fallback);
  }
}
