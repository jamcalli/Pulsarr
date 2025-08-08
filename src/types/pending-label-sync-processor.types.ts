/**
 * Configuration for pending label sync processing
 */
export interface PendingLabelSyncConfig {
  retryInterval: number // Process pending syncs every N seconds
  maxAge: number // Keep pending syncs for max N minutes
  cleanupInterval: number // Clean up expired syncs every N seconds
}
