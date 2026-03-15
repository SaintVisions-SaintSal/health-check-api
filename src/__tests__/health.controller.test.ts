/**
 * @file health.controller.test.ts
 * @description Integration tests for the health check HTTP endpoints.
 * Verifies correct HTTP status codes, response shapes, and edge cases.
 */

import express, { type Application } from 'express';
import request from 'supertest';
import { healthCache } from '../utils/cache';

// ---------------------------------------------------------------------------
// Mock the health service so controller tests remain unit-level
// ---------------------------------------------------------------------------
jest.mock('../services/health.service', () => ({
  getFullHealthReport: jest.fn(),
  getDatabaseReadiness: jest.fn(),
}));

import * as healthService from '../services/health.service';

// ---------------------------------------------------------------------------
// Import router AFTER mocks are in place
// ---------------------------------------------------------------------------
import { healthRouter } from '../routes/health.router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/api/health', healthRouter);
  return app;
}

const mockGetFullHealthReport = healthService.getFullHealthReport as jest.MockedFunction<
  typeof healthService.getFullHealthReport
>;
const mockGetDatabaseReadiness = healthService.getDatabaseReadiness as jest.MockedFunction<
  typeof healthService.getDatabaseReadiness
>;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Health Controller', () => {
  let app: Application;

  beforeEach(() => {
    app = buildApp();
    healthCache.clear();
    jest.clearAllMocks();
  });

  // ââ GET /api/health ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  describe('GET /api/health', () => {
    it('returns 200 with healthy payload when all dependencies are healthy', async () => {
      const mockReport = {
        status: 'healthy' as const,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: 1234.5,
        environment: 'test',
        dependencies: {
          database: { status: 'healthy' as const, latency_ms: 10, message: 'Connection established' },
          memory: { status: 'healthy' as const, used_mb: 50, total_mb: 512, usage_percent: 9.7 },
          disk: { status: 'healthy' as const, message: 'Sufficient space available' },
        },
      };

      mockGetFullHealthReport.mockResolvedValueOnce(mockReport);

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.dependencies.database.status).toBe('healthy');
    });

    it('returns 503 when any dependency is unhealthy', async () => {
      const mockReport = {
        status: 'unhealthy' as const,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: 1234.5,
        environment: 'test',
        dependencies: {
          database: { status: 'unhealthy' as const, latency_ms: null, message: 'Connection timeout after 5000ms' },
          memory: { status: 'healthy' as const, used_mb: 50, total_mb: 512, usage_percent: 9.7 },
          disk: { status: 'healthy' as const, message: 'Sufficient space available' },
        },
      };

      mockGetFullHealthReport.mockResolvedValueOnce(mockReport);

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.dependencies.database.status).toBe('unhealthy');
    });

    it('returns 500 when the service throws an unexpected error', async () => {
      mockGetFullHealthReport.mockRejectedValueOnce(new Error('Unexpected boom'));

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('status', 'error');
    });

    it('includes required top-level fields in the response', async () => {
      const mockReport = {
        status: 'healthy' as const,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: 100,
        environment: 'test',
        dependencies: {
          database: { status: 'healthy' as const, latency_ms: 5, message: 'ok' },
          memory: { status: 'healthy' as const, used_mb: 30, total_mb: 512, usage_percent: 5.8 },
          disk: { status: 'healthy' as const, message: 'ok' },
        },
      };

      mockGetFullHealthReport.mockResolvedValueOnce(mockReport);

      const res = await request(app).get('/api/health');

      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('environment');
      expect(res.body).toHaveProperty('dependencies');
    });
  });

  // ââ GET /api/health/live âââââââââââââââââââââââââââââââââââââââââââââââââââ

  describe('GET /api/health/live', () => {
    it('returns 200 with alive status', async () => {
      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('returns a valid ISO timestamp', async () => {
      const res = await request(app).get('/api/health/live');
      const ts = new Date(res.body.timestamp as string);
      expect(ts.toISOString()).toBe(res.body.timestamp);
    });
  });

  // ââ GET /api/health/ready ââââââââââââââââââââââââââââââââââââââââââââââââââ

  describe('GET /api/health/ready', () => {
    it('returns 200 with ready status when DB is reachable', async () => {
      mockGetDatabaseReadiness.mockResolvedValueOnce({ ready: true });

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });

    it('returns 503 with not_ready status when DB is unreachable', async () => {
      mockGetDatabaseReadiness.mockResolvedValueOnce({
        ready: false,
        reason: 'Database unreachable',
      });

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not_ready');
      expect(res.body).toHaveProperty('reason');
    });

    it('returns 500 when readiness check throws', async () => {
      mockGetDatabaseReadiness.mockRejectedValueOnce(new Error('DB exploded'));

      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('status', 'error');
    });
  });
});
