/**
 * Update Check Plugin
 *
 * Owns the lifecycle of the `UpdateCheckService`:
 *   - Decorates the Fastify instance as `fastify.updateCheck`
 *   - Kicks off a non-blocking initial refresh on boot
 *   - Registers an hourly cron via the existing scheduler convention
 *   - Within the cron job, dedupes against `lastNotifiedVersion` (DB-backed)
 *     so users receive at most one notification per release
 *   - On the false→true transition of `notifyOnUpdate`, baselines
 *     `lastNotifiedVersion` to the current latest so users only get
 *     notified for the *next* release after enabling
 */

import { UpdateCheckService } from '@services/update-check.service.js'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import semver from 'semver'

declare module 'fastify' {
  interface FastifyInstance {
    updateCheck: UpdateCheckService
  }
}

const JOB_NAME = 'update-check'
const CRON_EXPRESSION = '0 * * * *' // Top of every hour

const plugin: FastifyPluginAsync = async (fastify) => {
  const service = new UpdateCheckService(fastify.log, fastify)
  fastify.decorate('updateCheck', service)

  // Single-flight lock so concurrent callers (boot-time refresh + cron) cannot
  // race into duplicate notification dispatches against the same cached result.
  let notificationInFlight: Promise<void> | null = null

  /**
   * Runs after a refresh: dispatches a notification when the user has opted in
   * AND the latest version differs from the previously notified one.
   *
   * Watermark semantics: once the dedupe condition is satisfied we ALWAYS
   * advance `lastNotifiedVersion` after attempting delivery, regardless of
   * whether channels succeeded. This guarantees at-most-one notification
   * attempt per release and prevents endless hourly retries when a webhook URL
   * is permanently broken. The trade-off is that a transient delivery failure
   * means a missed notification for that version - acceptable for an
   * informational signal that is also surfaced in the in-app UI.
   */
  const handleNotification = async (): Promise<void> => {
    if (notificationInFlight) {
      return notificationInFlight
    }

    const run = (async () => {
      const status = service.getStatus()

      if (status.status !== 'ok' || !status.latestVersion) {
        return
      }

      if (!fastify.config.notifyOnUpdate) {
        return
      }

      const lastNotified = await fastify.db.getLastNotifiedVersion()

      // Baseline-on-enable: first observation while opted-in is silent.
      // (Re-enabling notifyOnUpdate also resets this column to null in
      // updateConfig, so the same baselining flow runs after a re-toggle.)
      if (!lastNotified) {
        await fastify.db.setLastNotifiedVersion(status.latestVersion)
        fastify.log.debug(
          { latestVersion: status.latestVersion },
          'Baselined lastNotifiedVersion on first opted-in observation',
        )
        return
      }

      // Only fire when latest is strictly greater than the last notified version.
      if (
        !semver.valid(lastNotified) ||
        !semver.valid(status.latestVersion) ||
        !semver.gt(status.latestVersion, lastNotified)
      ) {
        return
      }

      // The semver.gt check above already implies an update is available, but
      // this guard catches the edge case where the running build is newer than
      // GitHub latest (e.g. someone is running a dev/internal build).
      if (!status.updateAvailable) {
        return
      }

      // Advance the watermark BEFORE dispatch so a thrown exception during
      // dispatch still prevents a retry storm. We accept the small cost of
      // missing a transient-failure notification in exchange for bounded
      // retries.
      const targetVersion = status.latestVersion
      await fastify.db.setLastNotifiedVersion(targetVersion)

      try {
        const sent =
          await fastify.notifications.sendUpdateAvailableNotification({
            currentVersion: status.currentVersion,
            latestVersion: targetVersion,
            releaseUrl: status.releaseUrl ?? '',
            releaseName: status.releaseName,
            releaseBody: status.releaseBody,
            publishedAt: status.publishedAt,
          })

        if (sent) {
          fastify.log.info(
            { latestVersion: targetVersion },
            'Update-available notification dispatched and watermark advanced',
          )
        } else {
          fastify.log.warn(
            { latestVersion: targetVersion },
            'Update-available notification could not be delivered via any channel; watermark advanced to avoid retry storms',
          )
        }
      } catch (error) {
        fastify.log.error(
          { error, latestVersion: targetVersion },
          'Failed to dispatch update-available notification; watermark already advanced',
        )
      }
    })().finally(() => {
      notificationInFlight = null
    })

    notificationInFlight = run
    return run
  }

  const updateCheckHandler = async (jobName: string): Promise<void> => {
    fastify.log.debug(`Starting scheduled update check job: ${jobName}`)
    await service.refresh()
    await handleNotification()
  }

  fastify.addHook('onReady', async () => {
    try {
      // Kick off a non-blocking initial refresh so boot doesn't wait on GitHub.
      void service
        .refresh()
        .then(() => handleNotification())
        .catch((error) => {
          fastify.log.warn(
            { error },
            'Initial update-check refresh failed; cron will retry',
          )
        })

      const existingSchedule = await fastify.db.getScheduleByName(JOB_NAME)

      if (!existingSchedule) {
        const now = new Date()
        const nextRun = new Date(now)
        nextRun.setMinutes(0, 0, 0)
        if (nextRun <= now) {
          nextRun.setHours(nextRun.getHours() + 1)
        }

        await fastify.db.createSchedule({
          name: JOB_NAME,
          type: 'cron',
          config: { expression: CRON_EXPRESSION },
          enabled: true,
          last_run: null,
          next_run: {
            time: nextRun.toISOString(),
            status: 'pending',
            estimated: true,
          },
        })

        fastify.log.debug('Created update-check schedule (hourly)')
      }

      await fastify.scheduler.scheduleJob(JOB_NAME, async (jobName) => {
        try {
          const currentSchedule = await fastify.db.getScheduleByName(jobName)
          if (!currentSchedule?.enabled) {
            fastify.log.debug(`Job ${jobName} is disabled, skipping`)
            return
          }
          await updateCheckHandler(jobName)
        } catch (error) {
          fastify.log.error({ error }, `Error in scheduled job ${jobName}:`)
          throw error
        }
      })
    } catch (error) {
      fastify.log.error(
        { error },
        'Failed to initialize update-check scheduled job',
      )
    }
  })

  fastify.log.debug('Update check plugin initialized')
}

export default fp(plugin, {
  name: 'update-check',
  dependencies: ['scheduler', 'database', 'config', 'notification-service'],
})
