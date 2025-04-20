/**
 * Parses GUIDs from a string, array, or undefined input into an array of strings.
 *
 * If the input is undefined or falsy, returns an empty array. If the input is an array, returns it directly. If the input is a string, attempts to parse it as JSON; if parsing fails, returns an array containing the original string.
 *
 * @param guids - The input GUIDs as a string, array of strings, or undefined.
 * @returns An array of GUID strings.
 */
export function parseGuids(guids: string[] | string | undefined): string[] {
  if (!guids) return []
  if (Array.isArray(guids)) return guids
  try {
    return typeof guids === 'string' ? JSON.parse(guids) : []
  } catch (error) {
    return typeof guids === 'string' ? [guids] : []
  }
}

/**
 * Determines whether there is any common GUID between two inputs.
 *
 * Both inputs can be a string, an array of strings, or undefined. Returns true if at least one GUID appears in both inputs; otherwise, returns false.
 */
export function hasMatchingGuids(
  guids1: string[] | string | undefined,
  guids2: string[] | string | undefined,
): boolean {
  const parsed1 = parseGuids(guids1)
  const parsed2 = parseGuids(guids2)
  return parsed1.some((guid) => parsed2.includes(guid))
}

/**
 * Aggregates all unique GUIDs from an array of items into a Set.
 *
 * Each item should have a `guids` property containing a string, an array of strings, or undefined. All parsed GUIDs are added to the resulting Set, ensuring uniqueness.
 *
 * @param items - Array of objects, each with a `guids` property to extract GUIDs from.
 * @returns A Set containing all unique GUID strings found in the input items.
 */
export function createGuidSet(
  items: Array<{ guids: string[] | string | undefined }>,
): Set<string> {
  const guidSet = new Set<string>()
  for (const item of items) {
    // Using for...of instead of forEach for better performance
    for (const guid of parseGuids(item.guids)) {
      guidSet.add(guid)
    }
  }
  return guidSet
}

/**
 * Returns the first GUID from the input that starts with the specified type prefix.
 *
 * @param guids - A string, array of strings, or undefined representing one or more GUIDs.
 * @param type - The prefix to match at the start of a GUID (e.g., 'tmdb:', 'tvdb:').
 * @returns The first GUID string that starts with {@link type}, or undefined if none match.
 */
export function extractTypedGuid(
  guids: string[] | string | undefined,
  type: string,
): string | undefined {
  const parsed = parseGuids(guids)
  return parsed.find((guid) => guid.startsWith(type))
}
