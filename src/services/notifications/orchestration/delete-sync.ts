import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import { notifyAdmins } from '../dispatch.js'
import { createDeleteSyncMessage } from '../templates/messages.js'
import type { NotificationDeps } from '../types.js'

function summarize(results: DeleteSyncResult, dryRun: boolean): string {
  const notes = [
    ...(dryRun ? ['dry run'] : []),
    ...(results.safetyTriggered ? ['safety triggered'] : []),
  ]
  const counts = `${results.total.deleted} of ${results.total.processed} items deleted`
  return notes.length > 0 ? `${counts}, ${notes.join(', ')}` : counts
}

function toItems(items: DeleteSyncResult['movies']['items']) {
  return items.map((item) => ({
    title: item.title,
    guid: item.guid,
    instance: item.instance,
  }))
}

/** The only-on-deletion setting silences the admin channels of an empty run, never the native webhook. */
export async function sendDeleteSyncNotification(
  deps: NotificationDeps,
  results: DeleteSyncResult,
  dryRun: boolean,
): Promise<boolean> {
  const skipAdminChannels =
    deps.config.deleteSyncNotifyOnlyOnDeletion && results.total.deleted === 0
  const hasActivity =
    dryRun ||
    results.total.deleted > 0 ||
    results.total.skipped > 0 ||
    results.safetyTriggered === true
  const message = createDeleteSyncMessage(results, dryRun)

  return notifyAdmins(deps, {
    setting: skipAdminChannels ? 'none' : deps.config.deleteSyncNotify,
    line: { event: 'deleteSync', summary: summarize(results, dryRun) },
    message: {
      webhook: message.webhook,
      apprise: message.apprise,
      dm: hasActivity ? message.dm : undefined,
    },
    webhook: {
      event: 'delete_sync.completed',
      payload: {
        dryRun,
        total: {
          processed: results.total.processed,
          deleted: results.total.deleted,
          skipped: results.total.skipped,
          protected: results.total.protected,
        },
        movies: {
          deleted: results.movies.deleted,
          skipped: results.movies.skipped,
          protected: results.movies.protected,
          items: toItems(results.movies.items),
        },
        shows: {
          deleted: results.shows.deleted,
          skipped: results.shows.skipped,
          protected: results.shows.protected,
          items: toItems(results.shows.items),
        },
        safetyTriggered: results.safetyTriggered,
        safetyMessage: results.safetyMessage,
      },
    },
  })
}
