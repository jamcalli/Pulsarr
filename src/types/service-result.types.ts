export interface ExistenceCheckResult {
  /** Whether the item was found to exist */
  found: boolean
  /** Whether the check was able to be performed successfully */
  checked: boolean
  /** Name of the service that performed the check */
  serviceName: string
  /** Instance ID if applicable */
  instanceId?: number
  /** Error details if the check failed */
  error?: string
}

/**
 * Result of a simple health check on a service.
 */
export interface HealthCheckResult {
  /** Whether the service is reachable and responding */
  healthy: boolean
  /** Error message if unhealthy */
  error?: string
}

/**
 * Result of health checks across multiple instances.
 */
export interface InstanceHealthResult {
  /** Instance IDs that responded successfully */
  available: number[]
  /** Instance IDs that failed to respond */
  unavailable: number[]
}
