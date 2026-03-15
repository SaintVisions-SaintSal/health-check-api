/**
 * @file config/env.ts
 * @description Parses and validates all environment variables at startup using Zod.
 * Fails fast with a descriptive error if any required variable is missing or invalid.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(65535)),

  // Database
  DATABASE_URL: z
    .string()
    .url()
    .describe('Full PostgreSQL connection string'),
  DB_POOL_MAX: z
    .string()
    .default('10')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(100)),
  DB_POOL_IDLE_TIMEOUT_MS: z
    .string()
    .default('30000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0)),
  DB_CONNECT_TIMEOUT_MS: z
    .string()
    .default('5000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0)),

  // Health check
  HEALTH_CACHE_TTL_MS: z
    .string()
    .default('10000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0)),
  MEMORY_THRESHOLD_PERCENT: z
    .string()
    .default('90')
    .transform((v) => parseFloat(v))
    .pipe(z.number().min(0).max(100)),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('60000')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1000)),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .default('60')
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1)),

  // Versioning
  APP_VERSION: z.string().default('0.0.0'),
});

/**
 * Parsed and validated environment configuration.
 * Will throw a ZodError with a descriptive message at module load time
 * if any required variable is absent or fails validation.
 */
export type Env = z.infer<typeof envSchema>;

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('[env] Invalid environment configuration:');
  console.error(parseResult.error.format());
  process.exit(1);
}

export const env: Env = parseResult.data;
