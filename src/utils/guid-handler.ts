/**
 * Parses GUIDs from various input formats into a deduplicated array of strings.
 *
 * Accepts an array of strings, a JSON-encoded string representing an array, a comma-separated string, a single string, or undefined. Returns an empty array if the input is undefined or falsy. Ensures all returned GUIDs are unique and trimmed.
 *
 * @returns An array of unique GUID strings parsed from the input.
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
 * Returns `true` if the two GUID inputs share at least one common GUID.
 *
 * Accepts GUIDs as a string, an array of strings, or undefined. Inputs are parsed and compared for any overlap.
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
 * Collects all unique GUIDs from the `guids` property of each item in the input array.
 *
 * @param items - Array of objects, each with a `guids` property containing one or more GUIDs.
 * @returns A Set of unique GUID strings extracted from all items.
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
 * Retrieves the first GUID from the input that begins with the specified prefix.
 *
 * @param type - The prefix to match at the start of each GUID (e.g., 'tmdb:', 'tvdb:').
 * @returns The first GUID starting with {@link type}, or undefined if no such GUID exists.
 */
export function extractTypedGuid(
  guids: string[] | string | undefined,
  type: string,
): string | undefined {
  const parsed = parseGuids(guids)
  return parsed.find((guid) => guid.startsWith(type))
}

/**
 * Extracts the numeric TMDB ID from the provided GUIDs.
 *
 * Parses the input for a GUID prefixed with "tmdb:" and returns the numeric portion as an integer.
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
 * Extracts the numeric TVDB ID from the provided GUIDs.
 *
 * Parses the input and returns the first valid number found after the "tvdb:" prefix, or 0 if none is found.
 *
 * @returns The TVDB ID as a number, or 0 if not present or invalid.
 */
export function extractTvdbId(guids: string[] | string | undefined): number {
  const parsed = parseGuids(guids)
  const tvdbGuid = parsed.find((guid) => guid.startsWith('tvdb:'))
  if (!tvdbGuid) return 0

  const id = Number.parseInt(tvdbGuid.replace('tvdb:', ''), 10)
  return Number.isNaN(id) ? 0 : id
}

/**
 * Determines whether two arrays of GUID strings share at least one common value.
 *
 * @param parsedGuids1 - The first array of GUID strings.
 * @param parsedGuids2 - The second array of GUID strings.
 * @returns `true` if there is at least one matching GUID in both arrays; otherwise, `false`.
 *
 * @remark This function assumes both inputs are already parsed arrays of GUID strings and is more efficient than parsing inputs again.
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
