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
const CRON_EXPRESSION = '0 * * * *'

const plugin: FastifyPluginAsync = async (fastify) => {
  const service = new UpdateCheckService(fastify.log)
  fastify.decorate('updateCheck', service)

  const dispatchNotification = async (): Promise<void> => {
    const status = service.getStatus()
    if (status.status !== 'ok' || !status.latestVersion) return
    if (fastify.config.notifyOnUpdate === 'none') return

    const storedLastNotified = await fastify.db.getLastNotifiedVersion()
    // Fresh install (no watermark) dedupes against the running version.
    const effectiveLastNotified = storedLastNotified ?? status.currentVersion

    if (
      !semver.valid(effectiveLastNotified) ||
      !semver.valid(status.latestVersion) ||
      !semver.gt(status.latestVersion, effectiveLastNotified) ||
      !status.updateAvailable
    ) {
      return
    }

    const targetVersion = status.latestVersion

    try {
      const sent = await fastify.notifications.sendUpdateAvailableNotification({
        currentVersion: status.currentVersion,
        latestVersion: targetVersion,
        releaseUrl: status.releaseUrl ?? '',
        releaseName: status.releaseName,
        releaseBody: status.releaseBody,
        releaseBodyHtml: status.releaseBodyHtml,
        publishedAt: status.publishedAt,
      })
      if (sent) {
        // Advance only after delivery so a failed send retries next run.
        const persisted = await fastify.db.setLastNotifiedVersion(targetVersion)
        if (!persisted) {
          fastify.log.error(
            { latestVersion: targetVersion },
            'Update-available notification sent but watermark could not be persisted',
          )
          return
        }
        fastify.log.info(
          { latestVersion: targetVersion },
          'Update-available notification dispatched',
        )
      } else {
        fastify.log.warn(
          { latestVersion: targetVersion },
          'Update-available notification could not be delivered',
        )
      }
    } catch (error) {
      fastify.log.error(
        { error, latestVersion: targetVersion },
        'Failed to dispatch update-available notification',
      )
    }
  }

  // Serialize so boot and cron can't dispatch concurrently and double-notify.
  let notifyInFlight: Promise<void> | null = null
  const handleNotification = (): Promise<void> => {
    if (notifyInFlight) return notifyInFlight
    notifyInFlight = dispatchNotification().finally(() => {
      notifyInFlight = null
    })
    return notifyInFlight
  }

  fastify.addHook('onReady', async () => {
    try {
      void service
        .refresh()
        .then(async () => {
          await fastify.notifications.apprise.whenReady()
          await handleNotification()
        })
        .catch((error) => {
          fastify.log.warn(
            { error },
            'Boot-time update-check dispatch failed; cron will retry',
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
      }

      await fastify.scheduler.scheduleJob(JOB_NAME, async (jobName) => {
        try {
          const currentSchedule = await fastify.db.getScheduleByName(jobName)
          if (!currentSchedule?.enabled) {
            fastify.log.debug(`Job ${jobName} is disabled, skipping`)
            return
          }
          await service.refresh()
          await handleNotification()
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
}

export default fp(plugin, {
  name: 'update-check',
  dependencies: ['scheduler', 'database', 'config', 'notification-service'],
})
