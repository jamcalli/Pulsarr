/**
 * Parses GUIDs from a string, array, or undefined input into a string array.
 *
 * Accepts an array of strings, a JSON-encoded string representing an array of GUIDs, or a single string.
 * Returns an empty array if the input is undefined or falsy. If parsing a string as JSON fails, attempts to
 * handle it as a comma-separated list or a single GUID.
 *
 * @returns An array of GUID strings parsed from the input.
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
 * Determines whether two sets of GUIDs share at least one common GUID.
 *
 * Both inputs can be a string, an array of strings, or undefined. The function parses the inputs and checks for any overlap.
 *
 * @returns `true` if there is at least one matching GUID between the two sets; otherwise, `false`.
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
 * Aggregates all unique GUIDs from an array of items into a Set.
 *
 * Iterates through each item's `guids` property, parses it, and adds each GUID to the resulting Set.
 *
 * @param items - Array of objects, each containing a `guids` property to extract GUIDs from.
 * @returns A Set containing all unique GUIDs found in the input items.
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
 * Returns the first GUID from the input that starts with the specified type prefix.
 *
 * @param type - The prefix to match at the start of each GUID (e.g., 'tmdb:', 'tvdb:').
 * @returns The first matching GUID, or undefined if none are found.
 */
export function extractTypedGuid(
  guids: string[] | string | undefined,
  type: string,
): string | undefined {
  const parsed = parseGuids(guids)
  return parsed.find((guid) => guid.startsWith(type))
}

/**
 * Extracts a TMDB ID from the guids list.
 * Returns the numeric ID or 0 if not found or invalid.
 */
export function extractTmdbId(guids: string[] | string | undefined): number {
  const parsed = parseGuids(guids)
  const tmdbGuid = parsed.find((guid) => guid.startsWith('tmdb:'))
  if (!tmdbGuid) return 0

  const id = Number.parseInt(tmdbGuid.replace('tmdb:', ''), 10)
  return Number.isNaN(id) ? 0 : id
}

/**
 * Extracts a TVDB ID from the guids list.
 * Returns the numeric ID or 0 if not found or invalid.
 */
export function extractTvdbId(guids: string[] | string | undefined): number {
  const parsed = parseGuids(guids)
  const tvdbGuid = parsed.find((guid) => guid.startsWith('tvdb:'))
  if (!tvdbGuid) return 0

  const id = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
  return Number.isNaN(id) ? 0 : id
}

/**
 * Compares two already-parsed GUID arrays for matches.
 * Much faster than hasMatchingGuids when you already have parsed arrays.
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
