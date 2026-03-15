/**
 * @file withTimeout.ts
 * @description Utility to race a promise against a hard timeout sentinel.
 * Prevents hung async operations from blocking callers indefinitely.
 */

/** Symbol used as the timeout sentinel value for discriminated detection */
const TIMEOUT_SENTINEL = Symbol('TIMEOUT_SENTINEL');

/** Typed error thrown when a timeout is exceeded */
export class TimeoutError extends Error {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number, operationName?: string) {
    const label = operationName ? `'${operationName}'` : 'Operation';
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Races a promise against a timeout. If the timeout fires first, rejects
 * with a {@link TimeoutError}. Otherwise resolves or rejects with the
 * original promise's outcome.
 *
 * The internal timeout `NodeJS.Timeout` is always cleared to prevent
 * process hang-on-exit.
 *
 * @template T The resolved value type of the input promise.
 * @param promise - The async operation to race.
 * @param timeoutMs - Maximum allowed duration in milliseconds.
 * @param operationName - Optional label used in the timeout error message.
 * @returns The resolved value of `promise` if it completes before the timeout.
 * @throws {TimeoutError} If `timeoutMs` elapses before `promise` settles.
 *
 * @example
 * const result = await withTimeout(fetchData(), 5000, 'fetchData');
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName?: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
    timeoutHandle = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);

    if (result === TIMEOUT_SENTINEL) {
      throw new TimeoutError(timeoutMs, operationName);
    }

    return result as T;
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
