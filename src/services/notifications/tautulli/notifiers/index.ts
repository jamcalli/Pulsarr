/**
 * Tautulli Notifiers Domain
 *
 * Handles creating, configuring, and managing user notifiers in Tautulli.
 */

export {
  configureNotifier,
  createBasicNotifier,
  createUserNotifier,
  getPlexUserId,
  type NotifierCreatorDeps,
} from './notifier-creator.js'
export {
  ensureUserNotifier,
  getNotifiers,
  type NotifierManagerDeps,
  removeUserNotifier,
  syncUserNotifiers,
  type TautulliEnabledUser,
} from './notifier-manager.js'
