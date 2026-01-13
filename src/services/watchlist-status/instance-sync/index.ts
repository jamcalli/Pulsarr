/**
 * Instance Sync Module
 *
 * Handles synchronization of content to non-default *arr instances.
 */

export type {
  BatchCopyItem,
  BatchProcessorDeps,
  ProgressCallback,
} from './batch-processor.js'
export { processBatchCopy } from './batch-processor.js'
export type {
  InstanceSyncConfig,
  InstanceSyncerDeps,
  ProgressEmitter,
} from './instance-syncer.js'
export {
  createRadarrSyncConfig,
  createSonarrSyncConfig,
  syncInstance,
} from './instance-syncer.js'
export type { CopyItemContext, ItemCopierDeps } from './item-copier.js'
export { copySingleItem } from './item-copier.js'
