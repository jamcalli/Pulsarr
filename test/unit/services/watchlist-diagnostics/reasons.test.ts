import type {
  DiagnosticApproval,
  DiagnosticInstance,
} from '@schemas/watchlist-diagnostics/watchlist-diagnostics.schema.js'
import {
  type DiagnosisContext,
  describeNextReconciliation,
  diagnoseItem,
} from '@services/watchlist-diagnostics/reasons.js'
import { describe, expect, it } from 'vitest'

const NOW = Date.parse('2026-10-09T12:00:00Z')

function ctx(overrides: Partial<DiagnosisContext> = {}): DiagnosisContext {
  return {
    presence: 'both',
    type: 'movie',
    status: 'pending',
    guids: ['tmdb:603', 'imdb:tt0133093'],
    instances: [],
    approval: null,
    exclusion: null,
    canSync: true,
    watchlistCapExceeded: false,
    workflow: {
      status: 'running',
      nextReconciliationAt: '2026-10-09T12:42:00Z',
    },
    now: NOW,
    ...overrides,
  }
}

function instance(
  overrides: Partial<DiagnosticInstance> = {},
): DiagnosticInstance {
  return {
    arr: 'radarr',
    instanceId: 1,
    instanceName: 'Main',
    status: 'grabbed',
    isPrimary: true,
    syncing: false,
    lastNotifiedAt: null,
    ...overrides,
  }
}

function approval(
  overrides: Partial<DiagnosticApproval> = {},
): DiagnosticApproval {
  return {
    id: 7,
    status: 'pending',
    triggeredBy: 'router_rule',
    reason: null,
    ruleName: null,
    createdAt: '2026-10-08T00:00:00Z',
    ...overrides,
  }
}

describe('watchlist-diagnostics/reasons', () => {
  describe('describeNextReconciliation', () => {
    it('gives minutes until the scheduled reconciliation', () => {
      expect(
        describeNextReconciliation(
          { status: 'running', nextReconciliationAt: '2026-10-09T12:42:00Z' },
          NOW,
        ),
      ).toBe('the next full reconciliation is in ~42 min')
    })

    it('says it is due now when the time has passed', () => {
      expect(
        describeNextReconciliation(
          { status: 'running', nextReconciliationAt: '2026-10-09T11:00:00Z' },
          NOW,
        ),
      ).toBe('the next full reconciliation is due now')
    })

    it('falls back to a generic phrase without a schedule', () => {
      expect(
        describeNextReconciliation(
          { status: 'running', nextReconciliationAt: null },
          NOW,
        ),
      ).toBe('it should be picked up by the next sync')
      expect(
        describeNextReconciliation(
          { status: 'running', nextReconciliationAt: 'not a date' },
          NOW,
        ),
      ).toBe('it should be picked up by the next sync')
    })

    it('calls out a stopped workflow', () => {
      expect(
        describeNextReconciliation(
          { status: 'stopped', nextReconciliationAt: '2026-10-09T12:42:00Z' },
          NOW,
        ),
      ).toContain('not running')
    })
  })

  describe('diagnoseItem', () => {
    it('routed: lists each instance with its status', () => {
      const result = diagnoseItem(
        ctx({
          instances: [
            instance(),
            instance({
              arr: 'radarr',
              instanceId: 2,
              instanceName: '4K',
              status: 'notified',
            }),
          ],
        }),
      )
      expect(result.state).toBe('routed')
      expect(result.reason).toBe(
        'In Radarr "Main" (grabbed), Radarr "4K" (available, user notified)',
      )
    })

    it('routed wins over every gate that would otherwise apply', () => {
      const result = diagnoseItem(
        ctx({
          instances: [instance()],
          canSync: false,
          exclusion: { scope: 'global', excludedAt: '2026-01-01' },
          approval: approval({ status: 'rejected' }),
        }),
      )
      expect(result.state).toBe('routed')
    })

    it('not_seen_yet: on Plex only, with reconciliation timing', () => {
      const result = diagnoseItem(
        ctx({ presence: 'plex_only', status: null, guids: [] }),
      )
      expect(result.state).toBe('not_seen_yet')
      expect(result.reason).toBe(
        'On Plex, not seen by Pulsarr yet; the next full reconciliation is in ~42 min',
      )
    })

    it('not_seen_yet: mentions a stopped workflow', () => {
      const result = diagnoseItem(
        ctx({
          presence: 'plex_only',
          status: null,
          workflow: { status: 'stopped', nextReconciliationAt: null },
        }),
      )
      expect(result.state).toBe('not_seen_yet')
      expect(result.reason).toContain('not running')
    })

    it('Plex-only items still report an exclusion on their key', () => {
      const result = diagnoseItem(
        ctx({
          presence: 'plex_only',
          status: null,
          exclusion: { scope: 'user', excludedAt: '2026-01-01' },
        }),
      )
      expect(result.state).toBe('excluded_user')
    })

    it('removed_from_plex: stored but gone from Plex', () => {
      const result = diagnoseItem(ctx({ presence: 'pulsarr_only' }))
      expect(result.state).toBe('removed_from_plex')
      expect(result.reason).toContain('No longer on the user')
      expect(result.reason).toContain('~42 min')
    })

    it('removed_from_plex: notes where it is still routed', () => {
      const result = diagnoseItem(
        ctx({ presence: 'pulsarr_only', instances: [instance()] }),
      )
      expect(result.state).toBe('removed_from_plex')
      expect(result.reason).toContain('still in Radarr "Main"')
    })

    it('not_checked items are diagnosed from their stored state', () => {
      const result = diagnoseItem(
        ctx({ presence: 'not_checked', approval: approval() }),
      )
      expect(result.state).toBe('awaiting_approval')
    })

    it('sync_disabled: the user cannot sync', () => {
      expect(diagnoseItem(ctx({ canSync: false })).state).toBe('sync_disabled')
      expect(
        diagnoseItem(ctx({ canSync: false, presence: 'plex_only' })).state,
      ).toBe('sync_disabled')
    })

    it('watchlist_cap: pending items over the cap', () => {
      const result = diagnoseItem(ctx({ watchlistCapExceeded: true }))
      expect(result.state).toBe('watchlist_cap')
      expect(result.reason).toContain('movie watchlist cap')
    })

    it('watchlist_cap only applies to pending items', () => {
      const result = diagnoseItem(
        ctx({ watchlistCapExceeded: true, status: 'requested' }),
      )
      expect(result.state).toBe('not_routed')
    })

    it('excluded_global: a global exclusion', () => {
      const result = diagnoseItem(
        ctx({ exclusion: { scope: 'global', excludedAt: '2026-01-01' } }),
      )
      expect(result.state).toBe('excluded_global')
      expect(result.reason).toContain('all users')
    })

    it('excluded_user: a per-user exclusion', () => {
      const result = diagnoseItem(
        ctx({ exclusion: { scope: 'user', excludedAt: '2026-01-01' } }),
      )
      expect(result.state).toBe('excluded_user')
      expect(result.reason).toContain('this user')
    })

    it('unsupported_type: neither a movie nor a show', () => {
      const result = diagnoseItem(ctx({ type: 'episode' }))
      expect(result.state).toBe('unsupported_type')
      expect(result.reason).toContain('"episode"')
    })

    it('missing_ids: no external ids at all', () => {
      const result = diagnoseItem(ctx({ guids: [] }))
      expect(result.state).toBe('missing_ids')
      expect(result.reason).toContain('no external IDs')
    })

    it('missing_ids: a movie without a TMDB id', () => {
      const result = diagnoseItem(ctx({ guids: ['imdb:tt0133093'] }))
      expect(result.state).toBe('missing_ids')
      expect(result.reason).toContain('No TMDB ID')
    })

    it('missing_ids: a show without a TVDB id (special/webisode)', () => {
      const result = diagnoseItem(
        ctx({ type: 'show', guids: ['tmdb:1399', 'imdb:tt0944947'] }),
      )
      expect(result.state).toBe('missing_ids')
      expect(result.reason).toContain('No TVDB ID')
      expect(result.reason).toContain('webisodes')
    })

    it('missing_ids: a TMDB id of zero counts as missing, as in the router', () => {
      expect(diagnoseItem(ctx({ guids: ['tmdb:0'] })).state).toBe('missing_ids')
    })

    it('a show with a TVDB id is not flagged for a missing TMDB id', () => {
      expect(
        diagnoseItem(ctx({ type: 'SHOW', guids: ['tvdb:121361'] })).state,
      ).toBe('not_routed')
    })

    it('awaiting_approval: names the router rule', () => {
      const result = diagnoseItem(
        ctx({ approval: approval({ ruleName: 'Big 4K movies' }) }),
      )
      expect(result.state).toBe('awaiting_approval')
      expect(result.reason).toBe(
        'Awaiting admin approval: required by router rule "Big 4K movies"',
      )
    })

    it('awaiting_approval: explains each trigger', () => {
      expect(
        diagnoseItem(
          ctx({ approval: approval({ triggeredBy: 'quota_exceeded' }) }),
        ).reason,
      ).toContain('over their movie quota')
      expect(
        diagnoseItem(
          ctx({
            type: 'show',
            guids: ['tvdb:1'],
            approval: approval({ triggeredBy: 'quota_exceeded' }),
          }),
        ).reason,
      ).toContain('over their show quota')
      expect(
        diagnoseItem(
          ctx({ approval: approval({ triggeredBy: 'manual_flag' }) }),
        ).reason,
      ).toContain('every request')
      expect(
        diagnoseItem(
          ctx({ approval: approval({ triggeredBy: 'content_criteria' }) }),
        ).reason,
      ).toContain('approval criteria')
      expect(
        diagnoseItem(ctx({ approval: approval({ reason: 'Too big' }) })).reason,
      ).toContain('(Too big)')
    })

    it('approval_rejected, approval_expired and approved_not_routed', () => {
      expect(
        diagnoseItem(ctx({ approval: approval({ status: 'rejected' }) })).state,
      ).toBe('approval_rejected')
      expect(
        diagnoseItem(
          ctx({
            approval: approval({ status: 'rejected', ruleName: 'No anime' }),
          }),
        ).reason,
      ).toContain('router rule "No anime"')
      expect(
        diagnoseItem(ctx({ approval: approval({ status: 'expired' }) })).state,
      ).toBe('approval_expired')
      expect(
        diagnoseItem(ctx({ approval: approval({ status: 'approved' }) })).state,
      ).toBe('approved_not_routed')
      expect(
        diagnoseItem(ctx({ approval: approval({ status: 'auto_approved' }) }))
          .state,
      ).toBe('approved_not_routed')
    })

    it('missing ids are reported before a pending approval', () => {
      const result = diagnoseItem(ctx({ guids: [], approval: approval() }))
      expect(result.state).toBe('missing_ids')
    })

    it('not_routed: stored, valid, and nothing explains it', () => {
      const result = diagnoseItem(ctx())
      expect(result.state).toBe('not_routed')
      expect(result.reason).toContain('check the logs')
    })
  })
})
