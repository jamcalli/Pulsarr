import type { UpdateAvailableRelease } from '@root/types/notification.types.js'
import { notifyAdmins } from '../dispatch.js'
import { createUpdateAvailableMessage } from '../templates/messages.js'
import type { NotificationDeps } from '../types.js'

/** Resolves true when any admin channel delivered, so the caller can advance its watermark. */
export function sendUpdateAvailable(
  deps: NotificationDeps,
  release: UpdateAvailableRelease,
): Promise<boolean> {
  return notifyAdmins(deps, {
    setting: deps.config.notifyOnUpdate,
    line: {
      event: 'updateAvailable',
      summary: `v${release.latestVersion}, running v${release.currentVersion}`,
    },
    message: createUpdateAvailableMessage(release),
  })
}
