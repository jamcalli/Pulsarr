import type { ServerContentCheck } from './content-cache.js'

/** Unknown means the owner server gave no answer, so a missing item must not be routed. */
export type PlexExistence = 'found' | 'missing' | 'unknown'

/** Found on any server wins. Otherwise only the owner decides, where null is an owner server that could not be resolved. */
export function combineExistence(
  owner: ServerContentCheck | null,
  shared: ServerContentCheck[],
): PlexExistence {
  if (owner === 'found' || shared.includes('found')) return 'found'
  if (owner === null || owner === 'failed') return 'unknown'
  return 'missing'
}
