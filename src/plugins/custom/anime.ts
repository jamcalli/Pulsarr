import { AnimeService } from '@services/anime.service.js'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    anime: AnimeService
  }
}

async function animePlugin(fastify: FastifyInstance) {
  const animeService = new AnimeService(fastify.db, fastify.log)
  fastify.decorate('anime', animeService)

  fastify.addHook('onReady', async () => {
    try {
      await fastify.scheduler.scheduleJob(
        'anime-update',
        async () => {
          fastify.log.debug('Starting scheduled anime database update')
          const result = await animeService.updateAnimeDatabase()

          if (result.updated) {
            fastify.log.info(`Anime database updated: ${result.count} entries`)
          } else {
            fastify.log.info('Anime database update skipped - no changes')
          }
        },
        {
          defaultSchedule: {
            type: 'cron',
            config: { expression: '0 3 * * 0' },
          },
        },
      )

      const animeCount = await fastify.db.getAnimeCount()
      if (animeCount === 0) {
        fastify.log.debug(
          'Anime database is empty, running initial update in background...',
        )
        setImmediate(async () => {
          try {
            const result = await animeService.updateAnimeDatabase()
            if (result.updated) {
              fastify.log.info(
                `Initial anime database populated: ${result.count} entries`,
              )
            } else {
              fastify.log.info(
                'Initial anime database had no changes, nothing to populate',
              )
            }
          } catch (error) {
            fastify.log.error(
              { error },
              'Initial anime database update failed:',
            )
          }
        })
      } else {
        fastify.log.info(
          `Anime database already contains ${animeCount} entries`,
        )
      }

      fastify.log.debug('Anime plugin initialized successfully')
    } catch (error) {
      fastify.log.error({ error }, 'Failed to initialize anime plugin:')
    }
  })
}

export default fp(animePlugin, {
  name: 'anime',
  dependencies: ['database', 'scheduler'],
})
