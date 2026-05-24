import type { RollingMonitoredShow } from '@root/types/plex-session.types.js'
import {
  collectSeasonsEligibleForCleanup,
  userNeedsSeason,
} from '@services/plex-session-monitor/cleanup-predicates.js'
import { describe, expect, it } from 'vitest'

function makeUser(
  overrides: Partial<RollingMonitoredShow> & {
    plex_username: string
    last_watched_season: number
  },
): RollingMonitoredShow {
  return {
    id: 1,
    sonarr_series_id: 1566,
    show_title: 'Stella',
    monitoring_type: 'firstSeasonRolling',
    current_monitored_season: 1,
    last_watched_episode: 1,
    last_session_date: '2026-05-23T00:00:00Z',
    sonarr_instance_id: 1,
    plex_user_id: 'u1',
    created_at: '2026-05-22T00:00:00Z',
    updated_at: '2026-05-23T00:00:00Z',
    last_updated_at: '2026-05-23T00:00:00Z',
    ...overrides,
  }
}

describe('userNeedsSeason', () => {
  it('protects the user current season', () => {
    const user = makeUser({ plex_username: 'a', last_watched_season: 3 })
    expect(userNeedsSeason(user, 3)).toBe(true)
  })

  it('protects the next season after the user current position', () => {
    const user = makeUser({ plex_username: 'a', last_watched_season: 3 })
    expect(userNeedsSeason(user, 4)).toBe(true)
  })

  it('does not protect seasons before the user current position', () => {
    const user = makeUser({ plex_username: 'a', last_watched_season: 3 })
    expect(userNeedsSeason(user, 2)).toBe(false)
  })

  it('does not protect seasons more than one ahead of the user', () => {
    const user = makeUser({ plex_username: 'a', last_watched_season: 3 })
    expect(userNeedsSeason(user, 5)).toBe(false)
  })

  it('ignores current_monitored_season - relies only on last_watched_season', () => {
    // current_monitored_season only advances at end-of-season; a user on
    // S01E03 still needs S02 as their next, but current_monitored_season=1
    // would falsely allow S02 to be cleaned if the predicate consulted it.
    const user = makeUser({
      plex_username: 'a',
      last_watched_season: 1,
      current_monitored_season: 1,
    })
    expect(userNeedsSeason(user, 2)).toBe(true)
  })

  it('protects S1 for a fresh entry with last_watched_season 0', () => {
    const user = makeUser({
      plex_username: 'a',
      last_watched_season: 0,
    })
    expect(userNeedsSeason(user, 1)).toBe(true)
    expect(userNeedsSeason(user, 2)).toBe(false)
  })
})

describe('collectSeasonsEligibleForCleanup', () => {
  it('returns empty when range is empty', () => {
    const users = [makeUser({ plex_username: 'a', last_watched_season: 5 })]
    expect(collectSeasonsEligibleForCleanup(2, 2, users)).toEqual([])
  })

  it('returns the full range when there are no active users to protect any season', () => {
    expect(collectSeasonsEligibleForCleanup(2, 5, [])).toEqual([2, 3, 4])
  })

  describe('multi-user scenarios', () => {
    it('Stella bug scenario: two users at S1 and S4, only S3 is cleanable', () => {
      // firstSeasonRolling, cleanup range is [2, 4) since the triggering
      // user (nicole) is on S4. stormshaker on S01E03 must protect S2.
      const users = [
        makeUser({ plex_username: 'stormshaker', last_watched_season: 1 }),
        makeUser({ plex_username: 'nicole3876', last_watched_season: 4 }),
      ]
      expect(collectSeasonsEligibleForCleanup(2, 4, users)).toEqual([3])
    })

    it('leaves middle season cleanable when a gap exists between users', () => {
      // Users on S2 and S6 mean S4 is needed by nobody.
      const users = [
        makeUser({ plex_username: 'a', last_watched_season: 2 }),
        makeUser({ plex_username: 'b', last_watched_season: 6 }),
      ]
      // a protects {2,3}, b protects {6,7}. Range [2,6) cleans {4,5}.
      expect(collectSeasonsEligibleForCleanup(2, 6, users)).toEqual([4, 5])
    })

    it('single user advancing leaves earlier seasons cleanable', () => {
      const users = [makeUser({ plex_username: 'a', last_watched_season: 5 })]
      expect(collectSeasonsEligibleForCleanup(2, 5, users)).toEqual([2, 3, 4])
    })
  })

  describe('monitoring type ranges', () => {
    it('firstSeasonRolling: range starts at 2', () => {
      const users = [makeUser({ plex_username: 'a', last_watched_season: 1 })]
      // S1 is never in the cleanup range, even though it is "current" for a.
      expect(collectSeasonsEligibleForCleanup(2, 4, users)).toEqual([3])
    })

    it('pilotRolling: range starts at 2 (S1 handled by separate reset path)', () => {
      const users = [
        makeUser({
          plex_username: 'a',
          monitoring_type: 'pilotRolling',
          last_watched_season: 1,
        }),
      ]
      expect(collectSeasonsEligibleForCleanup(2, 4, users)).toEqual([3])
    })

    it('allSeasonPilotRolling: range starts at 1', () => {
      const users = [
        makeUser({
          plex_username: 'a',
          monitoring_type: 'allSeasonPilotRolling',
          last_watched_season: 3,
        }),
      ]
      // a protects {3,4}. Range [1,5) cleans {1,2} (E02+ removed, pilots kept).
      expect(collectSeasonsEligibleForCleanup(1, 5, users)).toEqual([1, 2])
    })
  })

  describe('pilotRolling S1 reset predicate (userNeedsSeason with season=1)', () => {
    it('protects S1 when a user is on S1', () => {
      const user = makeUser({
        plex_username: 'a',
        monitoring_type: 'pilotRolling',
        last_watched_season: 1,
      })
      expect(userNeedsSeason(user, 1)).toBe(true)
    })

    it('protects S1 for a fresh entry with last_watched_season 0', () => {
      const user = makeUser({
        plex_username: 'a',
        monitoring_type: 'pilotRolling',
        last_watched_season: 0,
      })
      expect(userNeedsSeason(user, 1)).toBe(true)
    })

    it('allows S1 reset when all active users have moved past S2', () => {
      const user = makeUser({
        plex_username: 'a',
        monitoring_type: 'pilotRolling',
        last_watched_season: 3,
      })
      expect(userNeedsSeason(user, 1)).toBe(false)
    })
  })
})
