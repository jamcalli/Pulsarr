import { errorMessage } from '@utils/error-message.js'
import type { WorkflowDeps } from '../types.js'

export async function fetchWatchlists(
  deps: Pick<WorkflowDeps, 'logger' | 'plexService' | 'state'>,
): Promise<void> {
  deps.logger.info('Refreshing watchlists')

  deps.state.clearReconciliationTimer()

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
        errorMessage: errorMessage(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error refreshing watchlists',
    )
    throw error
  }
}
