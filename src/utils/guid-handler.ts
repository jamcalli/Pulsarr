/**
 * Safely parse GUIDs from various input formats
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
 * Check if two GUID sets have any matching GUIDs
 */
export function hasMatchingGuids(
  guids1: string[] | string | undefined,
  guids2: string[] | string | undefined,
): boolean {
  const parsed1 = parseGuids(guids1)
  const parsed2 = parseGuids(guids2)
  
  if (parsed1.length > parsed2.length) {
    const set2 = new Set(parsed2)
    return parsed1.some(guid => set2.has(guid))
  } else {
    const set1 = new Set(parsed1)
    return parsed2.some(guid => set1.has(guid))
  }
}

/**
 * Create a Set of unique GUIDs from multiple items
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
 * Extract specific type of GUID (e.g., 'tmdb:', 'tvdb:')
 */
export function extractTypedGuid(
  guids: string[] | string | undefined,
  type: string,
): string | undefined {
  const parsed = parseGuids(guids)
  return parsed.find((guid) => guid.startsWith(type))
}