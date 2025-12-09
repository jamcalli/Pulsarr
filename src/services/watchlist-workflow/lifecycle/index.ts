/**
 * Lifecycle Module
 *
 * Handles workflow lifecycle management including scheduling.
 */

export {
  cleanupExistingManualSync,
  type SchedulerDeps,
  schedulePendingReconciliation,
  unschedulePendingReconciliation,
} from './scheduler.js'
