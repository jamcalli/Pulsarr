/**
 * Update Check Service
 *
 * Polls the GitHub Releases API for the project's latest release and
 * compares it against the currently running version using semver.
 *
 * Stateless and dependency-light — used both by the scheduled
 * notification job and (potentially) future on-demand checks.
 */

import { APP_VERSION, USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import semver from 'semver'

const GITHUB_REPO_OWNER = 'jamcalli'
const GITHUB_REPO_NAME = 'Pulsarr'
const REQUEST_TIMEOUT_MS = 15_000

export interface UpdateCheckResult {
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  releaseName: string | null
  releaseBody: string | null
  publishedAt: string | null
}

interface GitHubRelease {
  tag_name?: string
  name?: string | null
  html_url?: string
  body?: string | null
  published_at?: string | null
  draft?: boolean
  prerelease?: boolean
}

/**
 * Strip a leading `v` and run through `semver.clean` for safe comparison.
 */
function normalizeVersion(version: string): string | null {
  if (!version) return null
  return semver.clean(version) ?? semver.clean(version.replace(/^v/i, ''))
}

/**
 * Fetch the latest non-draft, non-prerelease release for jamcalli/Pulsarr
 * and compare it against `APP_VERSION`. Returns a structured result; on
 * network/auth failure returns `null` rather than throwing so callers can
 * decide whether to log/skip.
 */
export async function checkForUpdate(
  log: FastifyBaseLogger,
): Promise<UpdateCheckResult | null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`

  let release: GitHubRelease
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (response.status === 403 || response.status === 429) {
      log.warn(
        { status: response.status },
        'GitHub rate limit hit while checking for update — will retry on next schedule',
      )
      return null
    }

    if (!response.ok) {
      log.warn(
        { status: response.status, statusText: response.statusText },
        'Failed to fetch latest release from GitHub',
      )
      return null
    }

    release = (await response.json()) as GitHubRelease
  } catch (error) {
    log.warn({ error }, 'Error fetching latest release from GitHub')
    return null
  }

  // Skip drafts and prereleases — the /latest endpoint already excludes them,
  // but be defensive in case GitHub's behavior changes.
  if (release.draft || release.prerelease) {
    log.debug(
      { tag: release.tag_name },
      'Latest release is a draft or prerelease, skipping',
    )
    return null
  }

  const tag = release.tag_name ?? ''
  const latestVersion = normalizeVersion(tag)
  const currentVersion = normalizeVersion(APP_VERSION) ?? APP_VERSION

  if (!latestVersion || !semver.valid(latestVersion)) {
    log.debug({ tag }, 'GitHub returned an unparseable release tag')
    return null
  }

  const updateAvailable =
    semver.valid(currentVersion) !== null &&
    semver.gt(latestVersion, currentVersion)

  return {
    updateAvailable,
    currentVersion,
    latestVersion,
    releaseUrl: release.html_url ?? null,
    releaseName: release.name ?? null,
    releaseBody: release.body ?? null,
    publishedAt: release.published_at ?? null,
  }
}
