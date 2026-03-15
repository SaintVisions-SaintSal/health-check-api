/**
 * @file health.types.ts
 * @description Shared TypeScript types and interfaces for the Health Check API.
 * Centralised here to prevent circular imports across service, controller, and router layers.
 */

/** Possible status values for any individual check or the aggregate response */
export type HealthStatus = 'healthy' | 'unhealthy';

/** Possible status values for the liveness probe */
export type LiveStatus = 'alive';

/** Possible status values for the readiness probe */
export type ReadyStatus = 'ready' | 'not_ready';

// ---------------------------------------------------------------------------
// Individual Check Results
// ---------------------------------------------------------------------------

/** Result returned by the database dependency check */
export interface DatabaseCheckResult {
  readonly status: HealthStatus;
  readonly latency_ms: number | null;
  readonly message: string;
}

/** Result returned by the memory dependency check */
export interface MemoryCheckResult {
  readonly status: HealthStatus;
  readonly used_mb: number;
  readonly total_mb: number;
  readonly usage_percent: number;
  readonly message?: string;
}

/** Result returned by the disk dependency check */
export interface DiskCheckResult {
  readonly status: HealthStatus;
  readonly message: string;
}

/** Union of all possible dependency check results */
export type CheckResult = DatabaseCheckResult | MemoryCheckResult | DiskCheckResult;

// ---------------------------------------------------------------------------
// Dependency Map
// ---------------------------------------------------------------------------

/** Aggregated map of all dependency check results */
export interface DependencyResults {
  readonly database: DatabaseCheckResult;
  readonly memory: MemoryCheckResult;
  readonly disk: DiskCheckResult;
}

// ---------------------------------------------------------------------------
// Full Health Response
// ---------------------------------------------------------------------------

/** Shape of the full GET /api/health response body */
export interface FullHealthResponse {
  readonly status: HealthStatus;
  readonly timestamp: string;
  readonly version: string;
  readonly uptime: number;
  readonly environment: string;
  readonly dependencies: DependencyResults;
}

// ---------------------------------------------------------------------------
// Liveness & Readiness Responses
// ---------------------------------------------------------------------------

/** Shape of the GET /api/health/live response body */
export interface LivenessResponse {
  readonly status: LiveStatus;
  readonly timestamp: string;
}

/** Shape of the GET /api/health/ready response body (200 variant) */
export interface ReadinessResponseOk {
  readonly status: 'ready';
  readonly timestamp: string;
}

/** Shape of the GET /api/health/ready response body (503 variant) */
export interface ReadinessResponseFail {
  readonly status: 'not_ready';
  readonly timestamp: string;
  readonly reason: string;
}

export type ReadinessResponse = ReadinessResponseOk | ReadinessResponseFail;

// ---------------------------------------------------------------------------
// Internal Cache Entry
// ---------------------------------------------------------------------------

/** Wrapper used by the in-memory cache layer */
export interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}
