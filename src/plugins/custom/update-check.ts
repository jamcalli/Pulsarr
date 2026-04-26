import { sendUpdateAvailableNotification } from '@services/notifications/orchestration/update-available.js'
import { checkForUpdate } from '@services/update-check.service.js'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import semver from 'semver'

/**
 * Update Check Plugin
 *
 * Schedules a daily job that checks GitHub for a newer Pulsarr release and,
 * if one is found AND the user has opted in via `config.notifyOnUpdate`,
 * sends a one-shot notification through the existing Discord webhook +
 * Apprise system endpoint pipelines.
 *
 * State tracking via `config.lastNotifiedVersion` ensures the same release
 * is never announced more than once, even across server restarts.
 *
 * The check itself runs regardless of the opt-in flag (cheap, one HTTP call)
 * but no notification is dispatched unless `notifyOnUpdate === true`. This
 * keeps the data warm for the existing client-side update tooltip without
 * paying for a second poll.
 */
const plugin: FastifyPluginAsync = async (fastify) => {
  const JOB_NAME = 'update-check'

  const updateCheckHandler = async (jobName: string): Promise<void> => {
    fastify.log.info(`Starting scheduled update check job: ${jobName}`)

    const result = await checkForUpdate(fastify.log)
    if (!result) {
      // checkForUpdate already logged the failure reason
      return
    }

    if (!result.updateAvailable || !result.latestVersion) {
      fastify.log.debug(
        {
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
        },
        'Update check completed: no newer release available',
      )
      return
    }

    if (!fastify.config.notifyOnUpdate) {
      fastify.log.debug(
        {
          latestVersion: result.latestVersion,
          currentVersion: result.currentVersion,
        },
        'Update available but notifyOnUpdate is disabled; skipping notification',
      )
      return
    }

    const lastNotified = fastify.config.lastNotifiedVersion
    if (
      lastNotified &&
      semver.valid(lastNotified) &&
      semver.gte(lastNotified, result.latestVersion)
    ) {
      fastify.log.debug(
        { lastNotified, latestVersion: result.latestVersion },
        'Already notified for this version or newer; skipping',
      )
      return
    }

    const sent = await sendUpdateAvailableNotification(
      {
        logger: fastify.log,
        discordWebhook: fastify.notifications.discordWebhook,
        apprise: fastify.notifications.apprise,
        config: { discordWebhookUrl: fastify.config.discordWebhookUrl },
      },
      result,
    )

    if (sent) {
      try {
        await fastify.updateConfig({
          lastNotifiedVersion: result.latestVersion,
        })
        fastify.log.info(
          { latestVersion: result.latestVersion },
          'Recorded lastNotifiedVersion for update notification',
        )
      } catch (error) {
        fastify.log.error(
          { error },
          'Failed to persist lastNotifiedVersion after update notification',
        )
      }
    }
  }

  fastify.addHook('onReady', async () => {
    try {
      const existingSchedule = await fastify.db.getScheduleByName(JOB_NAME)

      if (!existingSchedule) {
        // Daily at 9 AM local — same time-of-day band that delete-sync uses,
        // gives the day's GitHub release time to settle before we poll.
        const now = new Date()
        const nextRun = new Date(now)
        nextRun.setHours(9, 0, 0, 0)
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1)
        }

        await fastify.db.createSchedule({
          name: JOB_NAME,
          type: 'cron',
          config: { expression: '0 9 * * *' },
          enabled: true,
          last_run: null,
          next_run: {
            time: nextRun.toISOString(),
            status: 'pending',
            estimated: true,
          },
        })

        fastify.log.debug('Created update-check schedule')
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
  dependencies: ['scheduler', 'database', 'config', 'notifications'],
})
