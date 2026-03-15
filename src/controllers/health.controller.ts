/**
 * @file controllers/health.controller.ts
 * @description Express request handlers for health check endpoints.
 * Delegates business logic to health.service and translates results to HTTP responses.
 */

import { type Request, type Response } from 'express';
import {
  getFullHealth,
  getLiveness,
  getReadiness,
} from '../services/health.service';

/**
 * Handles GET /api/health/live
 * Liveness probe â confirms the process is running.
 * Never touches the database. Always returns 200 if the process is alive.
 *
 * @param _req - Express request (unused)
 * @param res  - Express response
 */
export async function handleLiveness(_req: Request, res: Response): Promise<void> {
  try {
    const result = getLiveness();
    res.status(200).json(result);
  } catch (err) {
    console.error('[health.controller] Liveness check error:', err);
    res.status(500).json({ error: 'Internal server error during liveness check' });
  }
}

/**
 * Handles GET /api/health/ready
 * Readiness probe â confirms the app is ready to serve traffic (DB reachable).
 *
 * @param _req - Express request (unused)
 * @param res  - Express response
 */
export async function handleReadiness(_req: Request, res: Response): Promise<void> {
  try {
    const result = await getReadiness();
    const statusCode = result.status === 'ready' ? 200 : 503;
    res.status(statusCode).json(result);
  } catch (err) {
    console.error('[health.controller] Readiness check error:', err);
    res.status(500).json({ error: 'Internal server error during readiness check' });
  }
}

/**
 * Handles GET /api/health
 * Full health report â checks all dependencies concurrently.
 * Returns 503 if any dependency is unhealthy.
 *
 * @param _req - Express request (unused)
 * @param res  - Express response
 */
export async function handleFullHealth(_req: Request, res: Response): Promise<void> {
  try {
    const result = await getFullHealth();
    const statusCode = result.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(result);
  } catch (err) {
    console.error('[health.controller] Full health check error:', err);
    res.status(500).json({ error: 'Internal server error during health check' });
  }
}
