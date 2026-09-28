import { unschedulePendingReconciliation } from '../lifecycle/scheduler.js'
import type { WorkflowDeps } from '../types.js'

export async function fetchWatchlists(
  deps: Pick<WorkflowDeps, 'logger' | 'plexService' | 'fastify'>,
): Promise<void> {
  deps.logger.info('Refreshing watchlists')

  await unschedulePendingReconciliation({
    logger: deps.logger,
    fastify: deps.fastify,
  })

  try {
    deps.logger.debug('Fetching self and friends watchlists in parallel')
    await Promise.all([
      deps.plexService.getSelfWatchlist(),
      deps.plexService.getOthersWatchlists(),
    ])

    deps.logger.info('Watchlists refreshed successfully')
  } catch (error) {
    deps.logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error refreshing watchlists',
    )
    throw error
  }
}
