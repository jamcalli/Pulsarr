/**
 * Update Check Service
 *
 * Single source of truth for the latest Pulsarr release status. The plugin
 * (`src/plugins/custom/update-check.ts`) instantiates this once, refreshes it
 * on a server-side cron, and exposes the cached state via the
 * `/v1/system/update-status` route.
 *
 * Holds three pieces of state:
 *   - `result`: last successful comparison vs the running version
 *   - `lastCheckedAt`: when we last reached GitHub (success OR rate-limit)
 *   - `lastError`: short message describing the last failure, if any
 *
 * Concurrent calls share a single in-flight `refresh()` promise so cron + API
 * triggers cannot race into duplicate GitHub requests.
 */

import { createServiceLogger } from '@utils/logger.js'
import { APP_VERSION, USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import semver from 'semver'

const RELEASE_URL =
  'https://api.github.com/repos/jamcalli/Pulsarr/releases/latest'
const FETCH_TIMEOUT_MS = 15000

export type UpdateCheckStatus = 'ok' | 'pending' | 'rate_limited' | 'error'

export interface UpdateCheckResult {
  /** Cleaned current version (e.g. "1.42.0"). */
  currentVersion: string
  /** Cleaned latest version, or null when GitHub has not been reached yet. */
  latestVersion: string | null
  /** True only when both versions are valid semver and latest > current. */
  updateAvailable: boolean
  /** GitHub release URL (`html_url`) when known. */
  releaseUrl: string | null
  /** Display name from the release (often equal to tag), null when unknown. */
  releaseName: string | null
  /** Markdown release notes from GitHub, null when unknown. */
  releaseBody: string | null
  /** ISO timestamp when the release was published, null when unknown. */
  publishedAt: string | null
}

/**
 * Public, serialisable status returned to the API and persisted in cache.
 */
export interface UpdateCheckStatusPayload extends UpdateCheckResult {
  /** ISO timestamp of the most recent refresh attempt. */
  lastCheckedAt: string | null
  /** Short message describing the last failure, null on success. */
  lastError: string | null
  /** Coarse-grained status for clients that want to differentiate states. */
  status: UpdateCheckStatus
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  name?: string | null
  body?: string | null
  published_at?: string | null
  draft?: boolean
  prerelease?: boolean
}

/**
 * Normalises a tag to a clean semver string (strips an optional leading `v`).
 * Returns null when the input cannot be coerced to valid semver.
 */
function normaliseVersion(input: string | null | undefined): string | null {
  if (!input) return null
  const direct = semver.clean(input)
  if (direct) return direct
  const stripped = semver.clean(input.replace(/^v/i, ''))
  return stripped
}

const PENDING_STATUS = (currentVersion: string): UpdateCheckStatusPayload => ({
  currentVersion,
  latestVersion: null,
  updateAvailable: false,
  releaseUrl: null,
  releaseName: null,
  releaseBody: null,
  publishedAt: null,
  lastCheckedAt: null,
  lastError: null,
  status: 'pending',
})

export class UpdateCheckService {
  private readonly log: FastifyBaseLogger
  private readonly currentVersion: string
  private cached: UpdateCheckStatusPayload
  private refreshInFlight: Promise<UpdateCheckStatusPayload> | null = null

  constructor(baseLog: FastifyBaseLogger, _fastify: FastifyInstance) {
    this.log = createServiceLogger(baseLog, 'UPDATE_CHECK')
    this.currentVersion = normaliseVersion(APP_VERSION) ?? APP_VERSION
    this.cached = PENDING_STATUS(this.currentVersion)
  }

  /**
   * Returns the most recent cached status without triggering a refresh.
   * The plugin's GET route uses this directly so reads stay cheap.
   */
  getStatus(): UpdateCheckStatusPayload {
    return this.cached
  }

  /**
   * Refreshes the cached status by fetching the latest release from GitHub.
   * Concurrent callers receive the same in-flight promise.
   */
  async refresh(): Promise<UpdateCheckStatusPayload> {
    if (this.refreshInFlight) {
      return this.refreshInFlight
    }

    const promise = this.runRefresh()
      .catch((error) => {
        this.log.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Unhandled error during update-check refresh',
        )
        const next: UpdateCheckStatusPayload = {
          ...this.cached,
          lastCheckedAt: new Date().toISOString(),
          lastError:
            error instanceof Error ? error.message : 'Unknown refresh failure',
          status: 'error',
        }
        this.cached = next
        return next
      })
      .finally(() => {
        this.refreshInFlight = null
      })

    this.refreshInFlight = promise
    return promise
  }

  private async runRefresh(): Promise<UpdateCheckStatusPayload> {
    const checkedAt = new Date().toISOString()

    let response: Response
    try {
      response = await fetch(RELEASE_URL, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error'
      this.log.warn(
        { error: message },
        'Failed to fetch latest release from GitHub',
      )
      const next: UpdateCheckStatusPayload = {
        ...this.cached,
        lastCheckedAt: checkedAt,
        lastError: message,
        status: 'error',
      }
      this.cached = next
      return next
    }

    if (response.status === 403 || response.status === 429) {
      this.log.warn(
        { status: response.status },
        'GitHub API rate limit reached while checking for Pulsarr updates',
      )
      const next: UpdateCheckStatusPayload = {
        ...this.cached,
        lastCheckedAt: checkedAt,
        lastError: `GitHub rate limited (HTTP ${response.status})`,
        status: 'rate_limited',
      }
      this.cached = next
      return next
    }

    if (!response.ok) {
      const message = `GitHub API responded with HTTP ${response.status}`
      this.log.warn({ status: response.status }, message)
      const next: UpdateCheckStatusPayload = {
        ...this.cached,
        lastCheckedAt: checkedAt,
        lastError: message,
        status: 'error',
      }
      this.cached = next
      return next
    }

    let release: GitHubRelease
    try {
      release = (await response.json()) as GitHubRelease
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid JSON response'
      this.log.warn({ error: message }, 'Failed to parse GitHub release JSON')
      const next: UpdateCheckStatusPayload = {
        ...this.cached,
        lastCheckedAt: checkedAt,
        lastError: message,
        status: 'error',
      }
      this.cached = next
      return next
    }

    if (release.draft || release.prerelease) {
      this.log.debug(
        { tag: release.tag_name },
        'Latest GitHub release is a draft/prerelease, skipping',
      )
      const next: UpdateCheckStatusPayload = {
        ...this.cached,
        lastCheckedAt: checkedAt,
        lastError: null,
        status: 'ok',
      }
      this.cached = next
      return next
    }

    const latestVersion = normaliseVersion(release.tag_name)
    const updateAvailable = Boolean(
      latestVersion &&
        semver.valid(this.currentVersion) &&
        semver.valid(latestVersion) &&
        semver.gt(latestVersion, this.currentVersion),
    )

    const next: UpdateCheckStatusPayload = {
      currentVersion: this.currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: release.html_url ?? null,
      releaseName: release.name ?? release.tag_name ?? null,
      releaseBody: release.body ?? null,
      publishedAt: release.published_at ?? null,
      lastCheckedAt: checkedAt,
      lastError: null,
      status: 'ok',
    }
    this.cached = next
    return next
  }
}
