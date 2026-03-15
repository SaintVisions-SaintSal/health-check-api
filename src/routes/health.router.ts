/**
 * @file routes/health.router.ts
 * @description Express router for health check endpoints.
 * Mounts controller handlers at /live, /ready, and / (full check).
 */

import { Router } from 'express';
import {
  handleLiveness,
  handleReadiness,
  handleFullHealth,
} from '../controllers/health.controller';

/**
 * Router handling all /api/health sub-routes.
 *
 * Routes:
 * - GET /api/health        â Full dependency health report
 * - GET /api/health/live   â Liveness probe (process alive check)
 * - GET /api/health/ready  â Readiness probe (DB reachability check)
 */
export const healthRouter: Router = Router();

healthRouter.get('/live', handleLiveness);
healthRouter.get('/ready', handleReadiness);
healthRouter.get('/', handleFullHealth);
