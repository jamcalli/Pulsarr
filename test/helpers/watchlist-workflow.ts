import type { WorkflowState } from '@services/watchlist-workflow/state.js'
import type { WatchlistWorkflowService } from '@services/watchlist-workflow.service.js'
import type { Knex } from 'knex'
import { HttpResponse, http } from 'msw'
import { server } from '../setup/msw-setup.js'
import { seedConfig } from './seeds/config.js'
import { seedInstances } from './seeds/instances.js'
import { seedUsers } from './seeds/users.js'

export function useArrHandlers(): void {
  server.use(
    http.get('http://test-sonarr:8989/api/v3/system/status', () =>
      HttpResponse.json({ version: '4.0.0' }),
    ),
    http.get('http://test-radarr:7878/api/v3/system/status', () =>
      HttpResponse.json({ version: '5.0.0' }),
    ),
    http.get('http://test-sonarr:8989/api/v3/importlistexclusion/paged', () =>
      HttpResponse.json({
        page: 1,
        pageSize: 1000,
        totalRecords: 0,
        records: [],
      }),
    ),
    http.get('http://test-radarr:7878/api/v3/exclusions/paged', () =>
      HttpResponse.json({
        page: 1,
        pageSize: 1000,
        totalRecords: 0,
        records: [],
      }),
    ),
  )
}

export function workflowState(
  workflow: WatchlistWorkflowService,
): WorkflowState {
  // biome-ignore lint/complexity/useLiteralKeys: dot access to a private member does not compile
  return workflow['state']
}

export async function seedAll(knex: Knex): Promise<void> {
  await seedConfig(knex)
  await seedUsers(knex)
  await seedInstances(knex)
}
