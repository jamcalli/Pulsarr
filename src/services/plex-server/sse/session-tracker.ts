/**
 * Session Tracker
 *
 * Fires once per (sessionKey, ratingKey) pair seen in SSE playing events and
 * sweeps stale sessions.
 */

import type {
  PlexPlaySessionNotification,
  PlexSession,
} from '@root/types/plex-session.types.js'
import type { FastifyBaseLogger } from 'fastify'

interface TrackedSession {
  sessionKey: string
  ratingKey: string
  lastEventTime: number
}

export class SessionTracker {
  private readonly sessions = new Map<string, TrackedSession>()
  private readonly log: FastifyBaseLogger

  constructor(logger: FastifyBaseLogger) {
    this.log = logger
  }

  /**
   * Return true only for a new session or a new ratingKey on a tracked session.
   */
  handlePlayingEvent(notification: PlexPlaySessionNotification): boolean {
    const { sessionKey, ratingKey, state } = notification
    const existing = this.sessions.get(sessionKey)
    const now = Date.now()

    if (!existing) {
      if (state === 'stopped') return false

      this.sessions.set(sessionKey, {
        sessionKey,
        ratingKey,
        lastEventTime: now,
      })
      this.log.debug(
        { sessionKey, ratingKey, state },
        'New session detected via SSE',
      )
      return true
    }

    existing.lastEventTime = now

    if (state === 'stopped' || ratingKey === '') return false

    if (existing.ratingKey === '') {
      existing.ratingKey = ratingKey
      return false
    }

    if (ratingKey === existing.ratingKey) return false

    this.log.debug(
      { sessionKey, from: existing.ratingKey, to: ratingKey },
      'Session media changed',
    )
    existing.ratingKey = ratingKey
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
   * arriving after reconnect are correctly deduplicated.
   */
  hydrate(liveSessions: PlexSession[]): number {
    const now = Date.now()
    let added = 0

    for (const session of liveSessions) {
      if (this.sessions.has(session.sessionKey)) continue

      this.sessions.set(session.sessionKey, {
        sessionKey: session.sessionKey,
        ratingKey: session.ratingKey,
        lastEventTime: now,
      })
      added++
    }

    return added
  }

  /** Caller could not act on the fired event, so the next event for this session fires again. */
  forget(sessionKey: string): void {
    this.sessions.delete(sessionKey)
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
