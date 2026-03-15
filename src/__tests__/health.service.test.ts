/**
 * @file health.service.test.ts
 * @description Unit tests for the health service layer.
 * Verifies aggregation logic, caching behaviour, and correct status derivation.
 */

import { healthCache } from '../utils/cache';

// ---------------------------------------------------------------------------
// Mock individual check modules
// ---------------------------------------------------------------------------
jest.mock('../checks/database.check', () => ({
  checkDatabase: jest.fn(),
}));
jest.mock('../checks/memory.check', () => ({
  checkMemory: jest.fn(),
}));
jest.mock('../checks/disk.check', () => ({
  checkDisk: jest.fn(),
}));

import * as dbCheck from '../checks/database.check';
import * as memCheck from '../checks/memory.check';
import * as diskCheck from '../checks/disk.check';
import { getFullHealthReport, getDatabaseReadiness } from '../services/health.service';

const mockCheckDatabase = dbCheck.checkDatabase as jest.MockedFunction<typeof dbCheck.checkDatabase>;
const mockCheckMemory = memCheck.checkMemory as jest.MockedFunction<typeof memCheck.checkMemory>;
const mockCheckDisk = diskCheck.checkDisk as jest.MockedFunction<typeof diskCheck.checkDisk>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const healthyDbResult = { status: 'healthy' as const, latency_ms: 8, message: 'Connection established' };
const healthyMemResult = { status: 'healthy' as const, used_mb: 40, total_mb: 512, usage_percent: 7.8 };
const healthyDiskResult = { status: 'healthy' as const, message: 'Sufficient space available' };
const unhealthyDbResult = { status: 'unhealthy' as const, latency_ms: null, message: 'Timeout' };

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Health Service', () => {
  beforeEach(() => {
    healthCache.clear();
    jest.clearAllMocks();
  });

  // ââ getFullHealthReport ââââââââââââââââââââââââââââââââââââââââââââââââââââ

  describe('getFullHealthReport', () => {
    it('returns healthy status when all checks pass', async () => {
      mockCheckDatabase.mockResolvedValueOnce(healthyDbResult);
      mockCheckMemory.mockResolvedValueOnce(healthyMemResult);
      mockCheckDisk.mockResolvedValueOnce(healthyDiskResult);

      const report = await getFullHealthReport();

      expect(report.status).toBe('healthy');
      expect(report.dependencies.database.status).toBe('healthy');
      expect(report.dependencies.memory.status).toBe('healthy');
      expect(report.dependencies.disk.status).toBe('healthy');
    });

    it('returns unhealthy status when DB check fails', async () => {
      mockCheckDatabase.mockResolvedValueOnce(unhealthyDbResult);
      mockCheckMemory.mockResolvedValueOnce(healthyMemResult);
      mockCheckDisk.mockResolvedValueOnce(healthyDiskResult);

      const report = await getFullHealthReport();

      expect(report.status).toBe('unhealthy');
      expect(report.dependencies.database.status).toBe('unhealthy');
    });

    it('includes required top-level fields', async () => {
      mockCheckDatabase.mockResolvedValueOnce(healthyDbResult);
      mockCheckMemory.mockResolvedValueOnce(healthyMemResult);
      mockCheckDisk.mockResolvedValueOnce(healthyDiskResult);

      const report = await getFullHealthReport();

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('version');
      expect(report).toHaveProperty('uptime');
      expect(report).toHaveProperty('environment');
      expect(typeof report.uptime).toBe('number');
    });

    it('returns cached result on second call within TTL', async () => {
      mockCheckDatabase.mockResolvedValue(healthyDbResult);
      mockCheckMemory.mockResolvedValue(healthyMemResult);
      mockCheckDisk.mockResolvedValue(healthyDiskResult);

      await getFullHealthReport();
      await getFullHealthReport();

      // Checks should only have been called once (second call hits cache)
      expect(mockCheckDatabase).toHaveBeenCalledTimes(1);
      expect(mockCheckMemory).toHaveBeenCalledTimes(1);
      expect(mockCheckDisk).toHaveBeenCalledTimes(1);
    });

    it('re-runs checks after cache is invalidated', async () => {
      mockCheckDatabase.mockResolvedValue(healthyDbResult);
      mockCheckMemory.mockResolvedValue(healthyMemResult);
      mockCheckDisk.mockResolvedValue(healthyDiskResult);

      await getFullHealthReport();
      healthCache.clear();
      await getFullHealthReport();

      expect(mockCheckDatabase).toHaveBeenCalledTimes(2);
    });

    it('runs all checks concurrently (uses Promise.allSettled pattern)', async () => {
      const callOrder: string[] = [];

      mockCheckDatabase.mockImplementationOnce(async () => {
        callOrder.push('db-start');
        await new Promise((r) => setTimeout(r, 10));
        callOrder.push('db-end');
        return healthyDbResult;
      });

      mockCheckMemory.mockImplementationOnce(async () => {
        callOrder.push('mem-start');
        await new Promise((r) => setTimeout(r, 5));
        callOrder.push('mem-end');
        return healthyMemResult;
      });

      mockCheckDisk.mockImplementationOnce(async () => {
        callOrder.push('disk-start');
        return healthyDiskResult;
      });

      await getFullHealthReport();

      // All three should have started before any finished (concurrent)
      const startIndices = ['db-start', 'mem-start', 'disk-start'].map((e) =>
        callOrder.indexOf(e)
      );
      const firstEnd = Math.min(
        callOrder.indexOf('db-end'),
        callOrder.indexOf('mem-end')
      );
      expect(Math.max(...startIndices)).toBeLessThan(firstEnd);
    });
  });

  // ââ getDatabaseReadiness âââââââââââââââââââââââââââââââââââââââââââââââââââ

  describe('getDatabaseReadiness', () => {
    it('returns ready: true when database check is healthy', async () => {
      mockCheckDatabase.mockResolvedValueOnce(healthyDbResult);

      const result = await getDatabaseReadiness();

      expect(result.ready).toBe(true);
    });

    it('returns ready: false with reason when database check is unhealthy', async () => {
      mockCheckDatabase.mockResolvedValueOnce(unhealthyDbResult);

      const result = await getDatabaseReadiness();

      expect(result.ready).toBe(false);
      expect(result).toHaveProperty('reason');
    });

    it('returns ready: false when database check throws', async () => {
      mockCheckDatabase.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await getDatabaseReadiness();

      expect(result.ready).toBe(false);
      expect((result as { ready: false; reason: string }).reason).toMatch(/Connection refused/);
    });
  });
});
