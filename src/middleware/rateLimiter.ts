/**
 * @file rateLimiter.ts
 * @description Express rate-limiting middleware for health check endpoints.
 * Reads configuration from environment variables with safe defaults.
 */

import rateLimit from 'express-rate-limit';
import { z } from 'zod';

/** Zod schema for rate limiter environment config */
const RateLimitEnvSchema = z.object({
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 60_000))
    .pipe(z.number().int().positive()),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 60))
    .pipe(z.number().int().positive()),
});

/**
 * Parses and validates rate-limit configuration from environment variables.
 *
 * @returns Validated rate limit configuration object.
 * @throws {Error} If environment variables contain invalid values.
 */
function parseRateLimitConfig(): { windowMs: number; max: number } {
  const result = RateLimitEnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Invalid rate limit configuration: ${result.error.message}`
    );
  }
  return {
    windowMs: result.data.RATE_LIMIT_WINDOW_MS,
    max: result.data.RATE_LIMIT_MAX_REQUESTS,
  };
}

/**
 * Express middleware that applies a per-IP rate limit to health endpoints.
 *
 * Configuration is read from environment variables:
 * - `RATE_LIMIT_WINDOW_MS` â sliding window duration in ms (default: 60000)
 * - `RATE_LIMIT_MAX_REQUESTS` â max requests per window per IP (default: 60)
 *
 * Responds with HTTP 429 and a JSON body when the limit is exceeded.
 *
 * @example
 * app.use('/api/health', healthRateLimiter);
 */
export const healthRateLimiter = (() => {
  const config = parseRateLimitConfig();

  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 'error',
      message: 'Too many requests, please try again later.',
    },
    handler: (req, res, _next, options) => {
      res.status(options.statusCode).json(options.message);
    },
  });
})();
