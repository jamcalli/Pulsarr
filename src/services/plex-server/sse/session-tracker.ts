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
   * Seed the tracker with live sessions from the REST API so that SSE events
   * arriving after reconnect are correctly deduplicated. Sessions already
   * tracked (e.g. from a previous connection) are left untouched.
   */
  hydrate(liveSessions: PlexSession[]): number {
    const now = Date.now()
    let added = 0

    for (const session of liveSessions) {
      if (this.sessions.has(session.sessionKey)) continue

      this.sessions.set(session.sessionKey, {
        sessionKey: session.sessionKey,
        ratingKey: session.ratingKey,
        lastState: 'playing',
        lastEventTime: now,
      })
      added++
    }

    return added
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
