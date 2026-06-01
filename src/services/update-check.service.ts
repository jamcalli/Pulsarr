import { createServiceLogger } from '@utils/logger.js'
import { APP_VERSION, USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import semver from 'semver'

const RELEASE_URL =
  'https://api.github.com/repos/jamcalli/Pulsarr/releases/latest'
const MARKDOWN_URL = 'https://api.github.com/markdown'
const MARKDOWN_CONTEXT = 'jamcalli/Pulsarr'
const FETCH_TIMEOUT_MS = 15000

export type UpdateCheckStatus = 'ok' | 'pending' | 'rate_limited' | 'error'

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  releaseName: string | null
  releaseBody: string | null
  releaseBodyHtml: string | null
  publishedAt: string | null
}

export interface UpdateCheckStatusPayload extends UpdateCheckResult {
  lastCheckedAt: string | null
  lastError: string | null
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

function normaliseVersion(input: string | null | undefined): string | null {
  if (!input) return null
  const direct = semver.clean(input)
  if (direct) return direct
  return semver.clean(input.replace(/^v/i, ''))
}

const PENDING_STATUS = (currentVersion: string): UpdateCheckStatusPayload => ({
  currentVersion,
  latestVersion: null,
  updateAvailable: false,
  releaseUrl: null,
  releaseName: null,
  releaseBody: null,
  releaseBodyHtml: null,
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

  constructor(baseLog: FastifyBaseLogger) {
    this.log = createServiceLogger(baseLog, 'UPDATE_CHECK')
    this.currentVersion = normaliseVersion(APP_VERSION) ?? APP_VERSION
    this.cached = PENDING_STATUS(this.currentVersion)
  }

  getStatus(): UpdateCheckStatusPayload {
    return this.cached
  }

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

  private async renderReleaseBody(text: string): Promise<string | null> {
    if (!text.trim()) return null
    try {
      const response = await fetch(MARKDOWN_URL, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, mode: 'gfm', context: MARKDOWN_CONTEXT }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) {
        this.log.debug(
          { status: response.status },
          'GitHub /markdown render failed',
        )
        return null
      }
      return await response.text()
    } catch (error) {
      this.log.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'GitHub /markdown render errored',
      )
      return null
    }
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

    // Reuse cached HTML across cron ticks to avoid the rate budget.
    const reuseRenderedHtml =
      latestVersion &&
      this.cached.latestVersion === latestVersion &&
      this.cached.releaseBody === (release.body ?? null)
    const releaseBodyHtml = reuseRenderedHtml
      ? this.cached.releaseBodyHtml
      : await this.renderReleaseBody(release.body ?? '')

    const next: UpdateCheckStatusPayload = {
      currentVersion: this.currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: release.html_url ?? null,
      releaseName: release.name ?? release.tag_name ?? null,
      releaseBody: release.body ?? null,
      releaseBodyHtml,
      publishedAt: release.published_at ?? null,
      lastCheckedAt: checkedAt,
      lastError: null,
      status: 'ok',
    }
    this.cached = next
    return next
  }
}
