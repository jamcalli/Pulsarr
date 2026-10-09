import {
  canonicalImdbId,
  canonicalNumericId,
  parseGuids,
} from '@utils/guid-handler.js'

/** One entry from the live Plex watchlist; Plex returns no external IDs here. */
export interface LiveWatchlistItem {
  key: string
  title: string
  type: string
}

/** The fields of a stored watchlist_items row that diagnostics reads. */
export interface StoredWatchlistItem {
  id: number
  key: string
  title: string
  type: string
  status: 'pending' | 'requested' | 'grabbed' | 'notified'
  guids: string[]
  added: string | null
  lastNotifiedAt: string | null
}

export interface WatchlistDiff {
  matched: Array<{ live: LiveWatchlistItem; stored: StoredWatchlistItem }>
  plexOnly: LiveWatchlistItem[]
  pulsarrOnly: StoredWatchlistItem[]
}

/**
 * Plex keys arrive as bare rating keys from GraphQL and as
 * /library/metadata/<key>[/children] paths from the discover API.
 */
export function normalizeWatchlistKey(key: string): string {
  return key
    .trim()
    .replace(/^\/library\/metadata\//, '')
    .replace(/\/children$/, '')
}

/** Matches by Plex key, the same identity the sync and exclusion code use. */
export function diffWatchlist(
  live: LiveWatchlistItem[],
  stored: StoredWatchlistItem[],
): WatchlistDiff {
  const storedByKey = new Map<string, StoredWatchlistItem>()
  for (const item of stored) {
    const key = normalizeWatchlistKey(item.key)
    if (!storedByKey.has(key)) storedByKey.set(key, item)
  }

  const matched: WatchlistDiff['matched'] = []
  const plexOnly: LiveWatchlistItem[] = []
  const seenLive = new Set<string>()

  for (const item of live) {
    const key = normalizeWatchlistKey(item.key)
    if (!key || seenLive.has(key)) continue
    seenLive.add(key)

    const match = storedByKey.get(key)
    if (match) {
      matched.push({ live: { ...item, key }, stored: match })
    } else {
      plexOnly.push({ ...item, key })
    }
  }

  const pulsarrOnly = [...storedByKey.entries()]
    .filter(([key]) => !seenLive.has(key))
    .map(([, item]) => item)

  return { matched, plexOnly, pulsarrOnly }
}

/**
 * Normalizes GUIDs so equivalent IDs compare equal: provider://id and
 * provider:id, zero-padded TMDB/TVDB numbers, and IMDb IDs with or without
 * the tt prefix. Malformed or zero TMDB/TVDB/IMDb IDs are dropped, since the
 * router treats them as absent.
 */
export function canonicalizeGuids(guids: string[] | string | undefined) {
  const result = new Set<string>()
  for (const guid of parseGuids(guids)) {
    const separator = guid.indexOf(':')
    if (separator <= 0) continue
    const provider = guid.slice(0, separator)
    const raw = guid.slice(separator + 1)

    if (provider === 'tmdb' || provider === 'tvdb') {
      const id = canonicalNumericId(raw)
      if (id && id !== '0') result.add(`${provider}:${id}`)
    } else if (provider === 'imdb') {
      const id = canonicalImdbId(raw)
      if (id && !/^tt0+$/.test(id)) result.add(`imdb:${id}`)
    } else if (raw.length > 0) {
      result.add(guid)
    }
  }
  return [...result]
}

export interface ContentIds {
  tmdb: number | null
  tvdb: number | null
  imdb: string | null
}

export function extractContentIds(canonicalGuids: string[]): ContentIds {
  const find = (provider: string) =>
    canonicalGuids
      .find((guid) => guid.startsWith(`${provider}:`))
      ?.slice(provider.length + 1) ?? null

  const tmdb = find('tmdb')
  const tvdb = find('tvdb')
  return {
    tmdb: tmdb === null ? null : Number(tmdb),
    tvdb: tvdb === null ? null : Number(tvdb),
    imdb: find('imdb'),
  }
}

export function guidsOverlap(a: string[], b: string[]): boolean {
  const set = new Set(canonicalizeGuids(a))
  return canonicalizeGuids(b).some((guid) => set.has(guid))
}
