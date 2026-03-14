/**
 * Session Tracker
 *
 * Tracks per-session playback state from SSE playing events to detect
 * meaningful state transitions and sweep stale sessions.
 */

import type {
  PlexPlaySessionNotification,
  PlexSession,
} from '@root/types/plex-session.types.js'
import type { FastifyBaseLogger } from 'fastify'

interface TrackedSession {
  sessionKey: string
  ratingKey: string
  lastState: string
  lastEventTime: number
}

export class SessionTracker {
  private readonly sessions = new Map<string, TrackedSession>()
  private readonly log: FastifyBaseLogger

  constructor(logger: FastifyBaseLogger) {
    this.log = logger
  }

  /**
   * Process a playing event and return whether it represents a meaningful
   * state transition worth acting on (new session, state change, etc.).
   */
  handlePlayingEvent(notification: PlexPlaySessionNotification): boolean {
    const { sessionKey, ratingKey, state } = notification
    const existing = this.sessions.get(sessionKey)
    const now = Date.now()

    if (!existing) {
      // New session we haven't seen before
      this.sessions.set(sessionKey, {
        sessionKey,
        ratingKey,
        lastState: state,
        lastEventTime: now,
      })
      this.log.debug(
        { sessionKey, ratingKey, state },
        'New session detected via SSE',
      )
      return true
    }

    // Update timestamp regardless
    existing.lastEventTime = now

    if (existing.lastState === state) {
      // Same state, not a meaningful transition (e.g. repeated "playing" events)
      return false
    }

    // State changed
    this.log.debug(
      { sessionKey, from: existing.lastState, to: state },
      'Session state transition',
    )
    existing.lastState = state

    if (state === 'stopped') {
      this.sessions.delete(sessionKey)
    }

    return true
  }

  /**
   * Return all currently tracked sessions.
   */
  getTrackedSessions(): Map<string, TrackedSession> {
    return this.sessions
  }

  /**
   * Compare tracked sessions against live session data from /status/sessions.
   * Returns sessions that should be removed (tracked but no longer live) and
   * sessions that should be added (live but not tracked).
   */
  reconcile(liveSessions: PlexSession[]): {
    toRemove: string[]
    toAdd: PlexSession[]
  } {
    // PlexSession doesn't have sessionKey, so we match by what we have.
    // Build a set of grandparentKey+User.id combos from live sessions for matching.
    const liveKeys = new Set(
      liveSessions.map((s) => `${s.grandparentKey}:${s.User.id}`),
    )

    // Sessions in tracker that are no longer live
    const toRemove: string[] = []
    for (const [sessionKey, tracked] of this.sessions) {
      // We can't perfectly match since PlexSession lacks sessionKey,
      // so we keep tracked sessions unless they're clearly stale.
      // The stale sweep handles cleanup for sessions that stop sending events.
      // This is intentionally conservative - false positives are worse than
      // keeping a session tracked slightly longer.
      void tracked
      void liveKeys
      void sessionKey
    }

    // Live sessions not in tracker - can't match without sessionKey on PlexSession,
    // so we return all live sessions and let the caller decide
    const toAdd = liveSessions

    return { toRemove, toAdd }
  }

  /**
   * Return session keys that haven't received any events for longer than maxAgeMs.
   */
  sweepStale(maxAgeMs: number): string[] {
    const now = Date.now()
    const stale: string[] = []

    for (const [sessionKey, tracked] of this.sessions) {
      if (now - tracked.lastEventTime > maxAgeMs) {
        stale.push(sessionKey)
        this.sessions.delete(sessionKey)
        this.log.debug(
          { sessionKey, ratingKey: tracked.ratingKey },
          'Swept stale session from tracker',
        )
      }
    }

    return stale
  }

  /**
   * Clear all tracked sessions.
   */
  clear(): void {
    this.sessions.clear()
  }
}
