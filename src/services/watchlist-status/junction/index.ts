/**
 * Junction Module
 *
 * Handles junction table management between watchlist items and *arr instances.
 */

export type { JunctionProcessorDeps } from './junction-processor.js'
export {
  createRadarrJunctionConfig,
  createSonarrJunctionConfig,
  processJunctionUpdates,
} from './junction-processor.js'
