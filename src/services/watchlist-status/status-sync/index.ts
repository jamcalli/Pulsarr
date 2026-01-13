/**
 * Status Sync Module
 *
 * Handles synchronization of watchlist item statuses with *arr content.
 */

export type {
  MovieStatusUpdate,
  ShowStatusUpdate,
  StatusProcessorConfig,
  StatusProcessorDeps,
} from './status-processor.js'
export {
  createRadarrStatusConfig,
  createSonarrStatusConfig,
  processStatusUpdates,
} from './status-processor.js'
