/**
 * Converts a GUID string to lowercase and replaces "provider://id" with "provider:id" for consistent formatting.
 *
 * @param guid - The GUID string to normalize
 * @returns The normalized GUID string
 */
export function normalizeGuid(guid: string): string {
  // Normalize provider://id to provider:id and ensure lowercase
  return guid.replace('://', ':').toLowerCase()
}

/**
 * Parses GUID input from various formats into a deduplicated array of normalized GUID strings.
 *
 * Accepts an array of strings, a JSON-encoded string array, a comma-separated string, a single string, or undefined. All GUIDs are normalized for consistent comparison. Returns an empty array if the input is undefined or empty.
 *
 * @returns An array of unique, normalized GUID strings extracted from the input.
 */
export function parseGuids(guids: string[] | string | undefined): string[] {
  if (!guids) return []

  if (Array.isArray(guids))
    return [
      ...new Set(
        guids
          .map((g) => (typeof g === 'string' ? normalizeGuid(g.trim()) : ''))
          .filter((g): g is string => typeof g === 'string' && g.length > 0),
      ),
    ]

  if (typeof guids === 'string') {
    // Try strict JSON array first
    try {
      const parsed = JSON.parse(guids)
      if (Array.isArray(parsed)) {
        return [
          ...new Set(
            parsed
              .map((p) =>
                typeof p === 'string' ? normalizeGuid(p.trim()) : '',
              )
              .filter(
                (p): p is string => typeof p === 'string' && p.length > 0,
              ),
          ),
        ]
      }
    } catch {
      /* fall‑through */
    }

    // Handle string input
    const trimmed = guids.trim()
    if (trimmed === '') {
      return []
    }

    // Handle comma-separated list
    if (trimmed.includes(',')) {
      return [
        ...new Set(
          trimmed
            .split(',')
            .map((g) => normalizeGuid(g.trim()))
            .filter((g) => !!g),
        ),
      ]
    }

    // Last resort: treat as single GUID
    return [normalizeGuid(trimmed)]
  }
  return []
}

/**
 * Determines whether two GUID inputs have at least one GUID in common.
 *
 * Accepts GUIDs as a string, an array of strings, or undefined. Both inputs are parsed and compared for overlap.
 *
 * @returns `true` if any GUID is present in both inputs; otherwise, `false`.
 */
export function hasMatchingGuids(
  guids1: string[] | string | undefined,
  guids2: string[] | string | undefined,
): boolean {
  const parsed1 = parseGuids(guids1)
  const parsed2 = parseGuids(guids2)

  if (parsed1.length > parsed2.length) {
    const set2 = new Set(parsed2)
    return parsed1.some((guid) => set2.has(guid))
  }

  const set1 = new Set(parsed1)
  return parsed2.some((guid) => set1.has(guid))
}

/**
 * Returns a set of all unique GUIDs extracted from the `guids` property of each object in the input array.
 *
 * Each object's `guids` property may be a string, an array of strings, or undefined. All GUIDs are parsed, trimmed, and deduplicated.
 *
 * @returns A set containing all unique GUID strings found in the input.
 */
export function createGuidSet(
  items: Array<{ guids: string[] | string | undefined }>,
): Set<string> {
  const guidSet = new Set<string>()
  for (const item of items) {
    for (const guid of parseGuids(item.guids)) {
      guidSet.add(guid)
    }
  }
  return guidSet
}

/**
 * Returns the first GUID from the input that starts with the specified prefix.
 *
 * @param type - The prefix to match at the start of each GUID (e.g., 'tmdb:', 'tvdb:').
 * @returns The first GUID starting with {@link type}, or undefined if none is found.
 */
export function extractTypedGuid(
  guids: string[] | string | undefined,
  type: string,
): string | undefined {
  const parsed = parseGuids(guids)
  return parsed.find((guid) => guid.startsWith(type))
}

/**
 * Returns the TMDB numeric ID extracted from the first GUID prefixed with "tmdb:".
 *
 * If no valid TMDB GUID is found, returns 0.
 *
 * @param guids - Input containing one or more GUIDs in various formats.
 * @returns The TMDB ID as a number, or 0 if not found or invalid.
 */
export function extractTmdbId(guids: string[] | string | undefined): number {
  const parsed = parseGuids(guids)
  const tmdbGuid = parsed.find((guid) => guid.startsWith('tmdb:'))
  if (!tmdbGuid) return 0

  const id = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
  return Number.isNaN(id) ? 0 : id
}

/**
 * Extracts the numeric TVDB ID from the first GUID prefixed with "tvdb:".
 *
 * Parses the input for GUIDs, searches for one starting with "tvdb:", and returns the integer value following the prefix. Returns 0 if no valid TVDB GUID is found or if the extracted value is not a valid number.
 *
 * @returns The TVDB ID as a number, or 0 if not found or invalid.
 */
export function extractTvdbId(guids: string[] | string | undefined): number {
  const parsed = parseGuids(guids)
  const tvdbGuid = parsed.find((guid) => guid.startsWith('tvdb:'))
  if (!tvdbGuid) return 0

  const id = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
  return Number.isNaN(id) ? 0 : id
}

/**
 * Extracts the numeric IMDb ID from the first GUID prefixed with "imdb:".
 *
 * Removes the "imdb:" prefix and an optional leading "tt" before parsing the numeric ID. Returns 0 if no valid IMDb GUID is found or if the extracted ID is not a number.
 *
 * @returns The numeric IMDb ID, or 0 if not found or invalid.
 */
export function extractImdbId(guids: string[] | string | undefined): number {
  const parsed = parseGuids(guids)
  const imdbGuid = parsed.find((guid) => guid.startsWith('imdb:'))
  if (!imdbGuid) return 0

  const rawId = imdbGuid.replace('imdb:', '').replace(/^tt/i, '')
  const id = Number.parseInt(rawId, 10)
  return Number.isNaN(id) ? 0 : id
}

/**
 * Counts the number of matching GUIDs between two arrays of parsed GUID strings.
 *
 * @param parsedGuids1 - The first array of normalized GUID strings.
 * @param parsedGuids2 - The second array of normalized GUID strings.
 * @returns The count of GUIDs present in both arrays.
 */
export function getGuidMatchScore(
  parsedGuids1: string[],
  parsedGuids2: string[],
): number {
  const set1 = new Set(parsedGuids1)
  const matchingGuids = parsedGuids2.filter((guid) => set1.has(guid))
  return matchingGuids.length
}

/**
 * Determines whether two arrays of parsed GUID strings share at least one matching GUID.
 *
 * @param parsedGuids1 - The first array of normalized GUID strings.
 * @param parsedGuids2 - The second array of normalized GUID strings.
 * @returns `true` if any GUID is present in both arrays; otherwise, `false`.
 */
export function hasMatchingParsedGuids(
  parsedGuids1: string[],
  parsedGuids2: string[],
): boolean {
  return getGuidMatchScore(parsedGuids1, parsedGuids2) > 0
}

/**
 * Returns the numeric Radarr ID from the first GUID with a "radarr:" prefix.
 *
 * Accepts a string, array of strings, or undefined, and extracts the integer following the "radarr:" prefix (case-insensitive). Returns 0 if no valid Radarr GUID is found.
 *
 * @returns The extracted Radarr ID, or 0 if not present or invalid.
 */
export function extractRadarrId(guids: string[] | string | undefined): number {
  const parsed = parseGuids(guids)
  const radarrRegex = /^radarr:(\d+)/i

  for (const guid of parsed) {
    const match = radarrRegex.exec(guid)
    if (match) {
      const id = Number.parseInt(match[1], 10)
      return Number.isNaN(id) ? 0 : id
    }
  }

  return 0
}

/**
 * Returns the numeric Sonarr ID from the first GUID starting with "sonarr:" (case-insensitive).
 *
 * Accepts GUIDs as a string, array, or undefined, and extracts the integer following the "sonarr:" prefix. Returns 0 if no valid Sonarr GUID is found.
 *
 * @returns The extracted Sonarr ID, or 0 if not found or invalid.
 */
export function extractSonarrId(guids: string[] | string | undefined): number {
  const parsed = parseGuids(guids)
  const sonarrRegex = /^sonarr:(\d+)/i

  for (const guid of parsed) {
    const match = sonarrRegex.exec(guid)
    if (match) {
      const id = Number.parseInt(match[1], 10)
      return Number.isNaN(id) ? 0 : id
    }
  }

  return 0
}
