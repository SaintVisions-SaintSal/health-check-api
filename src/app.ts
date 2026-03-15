/**
 * @file app.ts
 * @description Express application factory. Configures middleware and mounts routers.
 */

import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { healthRouter } from './routes/health.router';

/**
 * Creates and configures an Express application instance.
 * Separating creation from listen() makes the app testable without binding a port.
 *
 * @returns Configured Express application
 */
export function createApp(): Application {
  const app = express();

  // ââ Security headers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  app.use(helmet());

  // ââ Body parsing ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  app.use(express.json());

  // ââ Rate limiting (applied globally; stricter limits on health router) ââââââ
  const globalLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use(globalLimiter);

  // ââ Routes ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  app.use('/api/health', healthRouter);

  // ââ 404 handler âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ââ Global error handler ââââââââââââââââââââââââââââââââââââââââââââââââââââ
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[app] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
