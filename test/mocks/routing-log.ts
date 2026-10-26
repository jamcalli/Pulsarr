import {
  createRoutingLog,
  type RoutingLog,
} from '@services/content-router/routing-log.js'
import { createMockLogger } from './logger.js'

export function createTestRoutingLog(): RoutingLog {
  return createRoutingLog({
    logger: createMockLogger(),
    item: { title: 'Item', guids: [] },
    userId: 1,
    instances: [],
  })
}
