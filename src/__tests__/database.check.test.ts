/**
 * @file database.check.test.ts
 * @description Unit tests for the database health check.
 * Verifies correct handling of successful pings, failures, and timeouts.
 */

// ---------------------------------------------------------------------------
// Mock the DB pool module before importing the check
// ---------------------------------------------------------------------------
jest.mock('../db/pool', () => ({
  getPool: jest.fn(),
}));

import * as poolModule from '../db/pool';
import { checkDatabase } from '../checks/database.check';
import { TimeoutError } from '../utils/withTimeout';

const mockGetPool = poolModule.getPool as jest.MockedFunction<typeof poolModule.getPool>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockPool = {
  query: jest.MockedFunction<(sql: string) => Promise<unknown>>;
};

function createMockPool(): MockPool {
  return { query: jest.fn() };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('checkDatabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns healthy result when pool query succeeds', async () => {
    const pool = createMockPool();
    pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    mockGetPool.mockReturnValue(pool as never);

    const result = await checkDatabase();

    expect(result.status).toBe('healthy');
    expect(typeof result.latency_ms).toBe('number');
    expect((result.latency_ms as number)).toBeGreaterThanOrEqual(0);
    expect(result.message).toMatch(/established/i);
  });

  it('returns unhealthy result when pool query rejects', async () => {
    const pool = createMockPool();
    pool.query.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mockGetPool.mockReturnValue(pool as never);

    const result = await checkDatabase();

    expect(result.status).toBe('unhealthy');
    expect(result.latency_ms).toBeNull();
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('returns unhealthy result with timeout message on TimeoutError', async () => {
    const pool = createMockPool();
    pool.query.mockRejectedValueOnce(new TimeoutError(5000, 'database ping'));
    mockGetPool.mockReturnValue(pool as never);

    const result = await checkDatabase();

    expect(result.status).toBe('unhealthy');
    expect(result.latency_ms).toBeNull();
    expect(result.message).toContain('5000');
  });

  it('returns unhealthy result when getPool throws', async () => {
    mockGetPool.mockImplementationOnce(() => {
      throw new Error('Pool not initialised');
    });

    const result = await checkDatabase();

    expect(result.status).toBe('unhealthy');
    expect(result.message).toContain('Pool not initialised');
  });

  it('measures a non-negative latency on success', async () => {
    const pool = createMockPool();
    pool.query.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ rows: [] }), 20)
        )
    );
    mockGetPool.mockReturnValue(pool as never);

    const result = await checkDatabase();

    expect(result.status).toBe('healthy');
    expect((result.latency_ms as number)).toBeGreaterThanOrEqual(15);
  });

  it('does not throw â always returns a CheckResult', async () => {
    const pool = createMockPool();
    pool.query.mockRejectedValueOnce('string error â not an Error instance');
    mockGetPool.mockReturnValue(pool as never);

    await expect(checkDatabase()).resolves.toMatchObject({ status: 'unhealthy' });
  });

  it('sets latency_ms to null on failure', async () => {
    const pool = createMockPool();
    pool.query.mockRejectedValueOnce(new Error('timeout'));
    mockGetPool.mockReturnValue(pool as never);

    const result = await checkDatabase();
    expect(result.latency_ms).toBeNull();
  });
});
