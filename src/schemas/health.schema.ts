/**
 * @file health.schema.ts
 * @description Zod schemas for runtime validation of environment variables
 * consumed by the health check subsystem, and for validating external
 * data returned by dependency probes before it reaches the response layer.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment Variable Schemas
// ---------------------------------------------------------------------------

/**
 * Schema for all environment variables relevant to the health check module.
 * Call `HealthEnvSchema.parse(process.env)` once at startup to fail fast
 * on missing or malformed configuration.
 */
export const HealthEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production', 'staging'])
    .default('development'),

  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a numeric string')
    .default('3000')
    .transform(Number),

  APP_VERSION: z.string().min(1).default('0.0.0'),

  HEALTH_CACHE_TTL_MS: z
    .string()
    .regex(/^\d+$/)
    .default('10000')
    .transform(Number),

  MEMORY_THRESHOLD_PERCENT: z
    .string()
    .regex(/^\d+$/)
    .default('90')
    .transform(Number)
    .refine((v) => v >= 1 && v <= 100, {
      message: 'MEMORY_THRESHOLD_PERCENT must be between 1 and 100',
    }),

  RATE_LIMIT_WINDOW_MS: z
    .string()
    .regex(/^\d+$/)
    .default('60000')
    .transform(Number),

  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .regex(/^\d+$/)
    .default('60')
    .transform(Number),
});

/** Inferred TypeScript type for validated health env vars */
export type HealthEnv = z.infer<typeof HealthEnvSchema>;

// ---------------------------------------------------------------------------
// Database Environment Schema
// ---------------------------------------------------------------------------

/**
 * Schema for database-related environment variables.
 * At minimum, DATABASE_URL must be present.
 */
export const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),

  DB_POOL_MAX: z
    .string()
    .regex(/^\d+$/)
    .default('10')
    .transform(Number),

  DB_POOL_IDLE_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/)
    .default('30000')
    .transform(Number),

  DB_CONNECT_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/)
    .default('5000')
    .transform(Number),
});

/** Inferred TypeScript type for validated database env vars */
export type DatabaseEnv = z.infer<typeof DatabaseEnvSchema>;

// ---------------------------------------------------------------------------
// Check Result Schemas (validate data leaving dependency probes)
// ---------------------------------------------------------------------------

/** Zod schema mirroring DatabaseCheckResult */
export const DatabaseCheckResultSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  latency_ms: z.number().nullable(),
  message: z.string(),
});

/** Zod schema mirroring MemoryCheckResult */
export const MemoryCheckResultSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  used_mb: z.number().nonnegative(),
  total_mb: z.number().positive(),
  usage_percent: z.number().min(0).max(100),
  message: z.string().optional(),
});

/** Zod schema mirroring DiskCheckResult */
export const DiskCheckResultSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  message: z.string(),
});

/** Zod schema mirroring DependencyResults */
export const DependencyResultsSchema = z.object({
  database: DatabaseCheckResultSchema,
  memory: MemoryCheckResultSchema,
  disk: DiskCheckResultSchema,
});

/** Zod schema mirroring FullHealthResponse */
export const FullHealthResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string().datetime(),
  version: z.string(),
  uptime: z.number().nonnegative(),
  environment: z.string(),
  dependencies: DependencyResultsSchema,
});
