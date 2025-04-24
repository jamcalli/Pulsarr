/**
 * Converts various GUID input formats into a deduplicated array of trimmed GUID strings.
 *
 * Accepts an array of strings, a JSON-encoded string representing an array, a comma-separated string, a single string, or undefined. Returns an empty array if the input is undefined or falsy. All returned GUIDs are unique and trimmed.
 *
 * @returns An array of unique, trimmed GUID strings parsed from the input.
 */
export function parseGuids(guids: string[] | string | undefined): string[] {
  if (!guids) return []

  if (Array.isArray(guids))
    return [
      ...new Set(
        guids
          .map((g) => (typeof g === 'string' ? g.trim() : g))
          .filter((g): g is string => !!g),
      ),
    ]

  if (typeof guids === 'string') {
    // Try strict JSON array first
    try {
      const parsed = JSON.parse(guids)
      if (Array.isArray(parsed)) {
        return [
          ...new Set(
            parsed.filter((p): p is string => typeof p === 'string' && !!p),
          ),
        ]
      }
    } catch {
      /* fall‑through */
    }

    // Fallback: comma‑separated list
    const trimmed = guids.trim()
    if (trimmed.includes(',')) {
      return [
        ...new Set(
          trimmed
            .split(',')
            .map((g) => g.trim())
            .filter((g) => !!g),
        ),
      ]
    }

    // Last resort: treat as single GUID
    return [trimmed]
  }
  return []
}

/**
 * Determines whether two GUID inputs share at least one common GUID.
 *
 * Accepts GUIDs as a string, an array of strings, or undefined, and parses both inputs before comparison.
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
 * Parses the input for GUIDs and retrieves the integer value following the "tmdb:" prefix. Returns 0 if no valid TMDB GUID is found.
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
 * Returns the numeric TVDB ID extracted from the first GUID prefixed with "tvdb:".
 *
 * Parses the input for GUIDs and returns the integer following the "tvdb:" prefix, or 0 if not found or invalid.
 *
 * @returns The extracted TVDB ID, or 0 if no valid "tvdb:" GUID is present.
 */
export function extractTvdbId(guids: string[] | string | undefined): number {
  const parsed = parseGuids(guids)
  const tvdbGuid = parsed.find((guid) => guid.startsWith('tvdb:'))
  if (!tvdbGuid) return 0

  const id = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
  return Number.isNaN(id) ? 0 : id
}

/**
 * Checks if two arrays of GUID strings have at least one value in common.
 *
 * @param parsedGuids1 - The first array of GUID strings.
 * @param parsedGuids2 - The second array of GUID strings.
 * @returns `true` if any GUID appears in both arrays; otherwise, `false`.
 *
 * @remark Assumes both inputs are already parsed and deduplicated arrays of GUID strings.
 */
export function hasMatchingParsedGuids(
  parsedGuids1: string[],
  parsedGuids2: string[],
): boolean {
  if (parsedGuids1.length > parsedGuids2.length) {
    const set2 = new Set(parsedGuids2)
    return parsedGuids1.some((guid) => set2.has(guid))
  }

  const set1 = new Set(parsedGuids1)
  return parsedGuids2.some((guid) => set1.has(guid))
}
