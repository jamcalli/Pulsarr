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
