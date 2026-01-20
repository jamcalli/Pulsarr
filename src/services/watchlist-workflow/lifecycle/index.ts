/**
 * Lifecycle Module
 *
 * Handles workflow lifecycle management including scheduling,
 * workflow initialization, and shutdown.
 */

export {
  cleanupExistingManualSync,
  type SchedulerDeps,
  schedulePendingReconciliation,
  setupPeriodicReconciliation,
  unschedulePendingReconciliation,
} from './scheduler.js'
// Workflow initialization
export {
  initializeWorkflow,
  type WorkflowInitResult,
  type WorkflowStartDeps,
} from './workflow-starter.js'
// Workflow shutdown
export {
  cleanupWorkflow,
  type WorkflowCleanupResult,
  type WorkflowComponents,
  type WorkflowStopDeps,
} from './workflow-stopper.js'
