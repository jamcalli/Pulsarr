import type { DatabaseService } from '@services/database.service.js'

/**
 * Return the most frequent genres across all watchlist items.
 *
 * Counts normalized genres (trimmed, lowercased) across the watchlist and returns the top results sorted by frequency.
 *
 * @param limit - Maximum number of genres to return (default: 10)
 * @returns Array of objects with `genre` and its occurrence `count`, ordered by `count` descending
 */
export async function getTopGenres(
  this: DatabaseService,
  limit = 10,
  days = 0,
): Promise<{ genre: string; count: number }[]> {
  try {
    this.log.debug('Processing genres with streaming approach')

    let cutoff: string | null = null
    if (days > 0) {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      cutoff = cutoffDate.toISOString()
    }

    // Use streaming to process genres in batches to reduce memory usage
    const genreCounts: Record<string, number> = {}
    const batchSize = 1000
    let lastId = 0
    let processedCount = 0
    let parseErrors = 0

    // Process in batches using cursor-based pagination
    while (true) {
      let batchQuery = this.knex('watchlist_items')
        .whereNotNull('genres')
        .where('genres', '!=', '[]')
        .andWhere('id', '>', lastId)
        .select('id', 'genres')
        .orderBy('id')
        .limit(batchSize)

      if (cutoff) {
        batchQuery = batchQuery.where('created_at', '>=', cutoff)
      }

      const batch = await batchQuery

      if (batch.length === 0) break

      // Process current batch with optimized JSON parsing
      for (const item of batch) {
        let parsed: string[]
        try {
          parsed = this.safeJsonParse(
            item.genres,
            [],
            'watchlist_item.genres',
          ) as string[]
        } catch (_err) {
          parseErrors++
          continue
        }

        if (Array.isArray(parsed)) {
          for (const genreItem of parsed) {
            if (typeof genreItem === 'string' && genreItem.trim().length > 0) {
              const normalizedGenre = genreItem.trim().toLowerCase()
              genreCounts[normalizedGenre] =
                (genreCounts[normalizedGenre] || 0) + 1
            }
          }
        }
      }

      processedCount += batch.length
      lastId = batch[batch.length - 1].id

      // Break if we got less than a full batch (reached the end)
      if (batch.length < batchSize) break
    }

    this.log.debug(
      `Processed genres from ${processedCount} watchlist items in batches (${parseErrors} parse errors)`,
    )

    // Sort genres by count and limit the results
    const sortedGenres = Object.entries(genreCounts)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    this.log.debug(
      `Returning ${sortedGenres.length} top genres from ${Object.keys(genreCounts).length} total genres`,
    )
    return sortedGenres
  } catch (error) {
    this.log.error({ error }, 'Error in getTopGenres:')
    throw error
  }
}

/**
 * Retrieves the most frequently watchlisted shows, returning their titles, watchlist counts, thumbnails, GUIDs, and users.
 *
 * @param options - Query options
 * @param options.limit - Maximum number of shows to return (default: 10)
 * @param options.offset - Number of results to skip for pagination (default: 0)
 * @param options.days - Filter to shows added within this many days (0 = all time, default: 0)
 * @returns An array of objects containing the show title, count, thumbnail, GUIDs, content type, and user names
 */
type WatchlistAggregateRow = {
  title: string
  guids: string
  thumb: string | null
  user_names: string | null
  count: number | string
}

export async function getMostWatchlistedShows(
  this: DatabaseService,
  options: { limit?: number; offset?: number; days?: number } = {},
): Promise<
  {
    title: string
    count: number
    thumb: string | null
    guids: string[]
    content_type: 'show'
    users: string[]
  }[]
> {
  const { limit = 10, offset = 0, days = 0 } = options
  const isAllTime = days === 0

  let query = this.knex('watchlist_items').where('type', 'show')

  if (!isAllTime) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    query = query.where(
      'watchlist_items.created_at',
      '>=',
      cutoffDate.toISOString(),
    )
  }

  // Use JSON aggregation to collect unique user names as a proper array
  const userAggregation = this.isPostgres
    ? this.knex.raw('JSON_AGG(DISTINCT u.name) as user_names')
    : this.knex.raw('JSON_GROUP_ARRAY(DISTINCT u.name) as user_names')

  const results = await query
    .leftJoin('users as u', 'watchlist_items.user_id', 'u.id')
    .select('watchlist_items.title', 'watchlist_items.guids')
    .select(this.knex.raw('MIN(watchlist_items.thumb) as thumb'))
    .select(userAggregation)
    .count('* as count')
    .groupBy('watchlist_items.title', 'watchlist_items.guids')
    .orderBy('count', 'desc')
    .limit(limit)
    .offset(offset)

  this.log.debug(
    `Retrieved ${results.length} most watchlisted shows ${isAllTime ? '(all time)' : `(last ${days} days)`}`,
  )

  return (results as WatchlistAggregateRow[]).map((row) => ({
    title: row.title,
    count: Number(row.count),
    thumb: row.thumb,
    guids: this.safeJsonParse(row.guids, [], 'watchlist_item.guids'),
    content_type: 'show' as const,
    users: this.safeJsonParse(
      row.user_names,
      [],
      'watchlist_item.user_names',
    ).filter(Boolean),
  }))
}

/**
 * Retrieves the most frequently watchlisted movies, returning their titles, watchlist counts, thumbnails, GUIDs, and users.
 *
 * @param options - Query options
 * @param options.limit - Maximum number of movies to return (default: 10)
 * @param options.offset - Number of results to skip for pagination (default: 0)
 * @param options.days - Filter to movies added within this many days (0 = all time, default: 0)
 * @returns Array of objects containing movie title, count, thumbnail, GUIDs, content type, and user names
 */
export async function getMostWatchlistedMovies(
  this: DatabaseService,
  options: { limit?: number; offset?: number; days?: number } = {},
): Promise<
  {
    title: string
    count: number
    thumb: string | null
    guids: string[]
    content_type: 'movie'
    users: string[]
  }[]
> {
  const { limit = 10, offset = 0, days = 0 } = options
  const isAllTime = days === 0

  let query = this.knex('watchlist_items').where('type', 'movie')

  if (!isAllTime) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    query = query.where(
      'watchlist_items.created_at',
      '>=',
      cutoffDate.toISOString(),
    )
  }

  // Use JSON aggregation to collect unique user names as a proper array
  const userAggregation = this.isPostgres
    ? this.knex.raw('JSON_AGG(DISTINCT u.name) as user_names')
    : this.knex.raw('JSON_GROUP_ARRAY(DISTINCT u.name) as user_names')

  const results = await query
    .leftJoin('users as u', 'watchlist_items.user_id', 'u.id')
    .select('watchlist_items.title', 'watchlist_items.guids')
    .select(this.knex.raw('MIN(watchlist_items.thumb) as thumb'))
    .select(userAggregation)
    .count('* as count')
    .groupBy('watchlist_items.title', 'watchlist_items.guids')
    .orderBy('count', 'desc')
    .limit(limit)
    .offset(offset)

  this.log.debug(
    `Retrieved ${results.length} most watchlisted movies ${isAllTime ? '(all time)' : `(last ${days} days)`}`,
  )

  return (results as WatchlistAggregateRow[]).map((row) => ({
    title: row.title,
    count: Number(row.count),
    thumb: row.thumb,
    guids: this.safeJsonParse(row.guids, [], 'watchlist_item.guids'),
    content_type: 'movie' as const,
    users: this.safeJsonParse(
      row.user_names,
      [],
      'watchlist_item.user_names',
    ).filter(Boolean),
  }))
}

/**
 * Returns the users with the highest number of watchlist items.
 *
 * @param limit - Maximum number of users to include in the result (default: 10)
 * @returns An array of user names and their corresponding watchlist item counts, sorted by count descending
 */
export async function getUsersWithMostWatchlistItems(
  this: DatabaseService,
  options: { limit?: number; days?: number } = {},
): Promise<{ name: string; count: number; movies: number; shows: number }[]> {
  const { limit = 10, days = 0 } = options
  let cutoff: string | null = null
  if (days > 0) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    cutoff = cutoffDate.toISOString()
  }

  let query = this.knex('watchlist_items')
    .join('users', 'watchlist_items.user_id', '=', 'users.id')
    .select('users.id', 'users.name')
    .count('watchlist_items.id as count')
    .groupBy('users.id', 'users.name')
    .orderBy('count', 'desc')
    .limit(limit)

  if (cutoff) {
    query = query.where('watchlist_items.created_at', '>=', cutoff)
  }

  const results = await query
  if (results.length === 0) {
    return []
  }

  let typeQuery = this.knex('watchlist_items')
    .whereIn(
      'watchlist_items.user_id',
      results.map((row) => Number(row.id)),
    )
    .select('watchlist_items.user_id', 'watchlist_items.type')
    .count('watchlist_items.id as count')
    .groupBy('watchlist_items.user_id', 'watchlist_items.type')

  if (cutoff) {
    typeQuery = typeQuery.where('watchlist_items.created_at', '>=', cutoff)
  }

  const typeCounts = new Map<number, { movies: number; shows: number }>()
  for (const row of await typeQuery) {
    const userId = Number(row.user_id)
    const split = typeCounts.get(userId) ?? { movies: 0, shows: 0 }
    if (row.type === 'movie') split.movies += Number(row.count)
    if (row.type === 'show') split.shows += Number(row.count)
    typeCounts.set(userId, split)
  }

  return results.map((row) => ({
    name: String(row.name),
    count: Number(row.count),
    ...(typeCounts.get(Number(row.id)) ?? { movies: 0, shows: 0 }),
  }))
}

export async function getWatchlistStatusDistribution(
  this: DatabaseService,
): Promise<{ status: string; count: number }[]> {
  const rows = await this.knex('watchlist_items')
    .select('status')
    .count('* as count')
    .groupBy('status')
    .orderBy('count', 'desc')

  return rows.map((row) => ({
    status: String(row.status),
    count: Number(row.count),
  }))
}

/**
 * Returns the distribution of watchlist items grouped by normalized content type.
 *
 * @returns An array of objects, each containing a content type and its corresponding item count.
 */
export async function getContentTypeDistribution(
  this: DatabaseService,
): Promise<{ type: string; count: number }[]> {
  const results = await this.knex('watchlist_items')
    .select('type')
    .count('* as count')
    .groupBy('type')

  const typeMap: Record<string, number> = {}
  for (const row of results) {
    const normalizedType = String(row.type).toLowerCase()
    typeMap[normalizedType] = (typeMap[normalizedType] || 0) + Number(row.count)
  }

  this.log.debug(
    `Calculated content type distribution across ${Object.keys(typeMap).length} types`,
  )

  return Object.entries(typeMap).map(([type, count]) => ({
    type,
    count,
  }))
}

/**
 * Retrieves counts of new watchlist items, status changes, and notifications sent within the past specified number of days.
 *
 * @param days - Number of days to look back for activity statistics (default: 30, 0 = all time)
 * @returns An object containing counts for new watchlist items, status changes, and notifications sent
 */
export async function getRecentActivityStats(
  this: DatabaseService,
  days = 30,
): Promise<{
  new_watchlist_items: number
  status_changes: number
  notifications_sent: number
}> {
  const isAllTime = days === 0

  this.log.debug(
    `Calculating recent activity stats ${isAllTime ? '(all time)' : `for last ${days} days`}`,
  )

  let newItemsQuery = this.knex('watchlist_items')
  let statusChangesQuery = this.knex('watchlist_status_history')
  let notificationsQuery = this.knex('notifications')

  if (!isAllTime) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    newItemsQuery = newItemsQuery.where(
      'created_at',
      '>=',
      cutoffDate.toISOString(),
    )
    statusChangesQuery = statusChangesQuery.where(
      'timestamp',
      '>=',
      cutoffDate.toISOString(),
    )
    notificationsQuery = notificationsQuery.where(
      'created_at',
      '>=',
      cutoffDate.toISOString(),
    )
  }

  const [newItems, statusChanges, notifications] = await Promise.all([
    newItemsQuery.count('* as count').first(),
    statusChangesQuery.count('* as count').first(),
    notificationsQuery.count('* as count').first(),
  ])

  const stats = {
    new_watchlist_items: Number(newItems?.count || 0),
    status_changes: Number(statusChanges?.count || 0),
    notifications_sent: Number(notifications?.count || 0),
  }

  this.log.debug({ stats }, 'Computed recent activity stats')

  return stats
}

/**
 * Retrieves the number of watchlist items associated with each Sonarr and Radarr instance.
 *
 * @returns An array of objects containing the instance ID, type ('sonarr' or 'radarr'), name, and item count, sorted by item count in descending order.
 */
export async function getInstanceActivityStats(this: DatabaseService): Promise<
  {
    instance_id: number
    instance_type: 'sonarr' | 'radarr'
    name: string
    item_count: number
  }[]
> {
  this.log.debug('Retrieving instance activity statistics')

  const sonarrResults = await this.knex('watchlist_items')
    .join(
      'sonarr_instances',
      'watchlist_items.sonarr_instance_id',
      '=',
      'sonarr_instances.id',
    )
    .whereNotNull('watchlist_items.sonarr_instance_id')
    .select('sonarr_instances.id as instance_id', 'sonarr_instances.name')
    .count('watchlist_items.id as item_count')
    .groupBy('sonarr_instances.id', 'sonarr_instances.name')

  const radarrResults = await this.knex('watchlist_items')
    .join(
      'radarr_instances',
      'watchlist_items.radarr_instance_id',
      '=',
      'radarr_instances.id',
    )
    .whereNotNull('watchlist_items.radarr_instance_id')
    .select('radarr_instances.id as instance_id', 'radarr_instances.name')
    .count('watchlist_items.id as item_count')
    .groupBy('radarr_instances.id', 'radarr_instances.name')

  const sonarrStats = sonarrResults.map((row) => ({
    instance_id: Number(row.instance_id),
    instance_type: 'sonarr' as const,
    name: String(row.name),
    item_count: Number(row.item_count),
  }))

  const radarrStats = radarrResults.map((row) => ({
    instance_id: Number(row.instance_id),
    instance_type: 'radarr' as const,
    name: String(row.name),
    item_count: Number(row.item_count),
  }))

  const combinedStats = [...sonarrStats, ...radarrStats].sort(
    (a, b) => b.item_count - a.item_count,
  )

  this.log.debug(
    `Retrieved activity stats for ${sonarrStats.length} Sonarr instances and ${radarrStats.length} Radarr instances`,
  )

  return combinedStats
}

/**
 * Days from an item's requested history row to its earliest later grabbed or notified row, per content type, over items requested within the window.
 */
export async function getAverageTimeFromGrabbedToNotified(
  this: DatabaseService,
  days = 30,
): Promise<
  {
    content_type: string
    avg_days: number
    min_days: number
    max_days: number
    median_days: number
    p90_days: number
    count: number
    pending: number
  }[]
> {
  try {
    const requested = this.knex('watchlist_status_history')
      .select('watchlist_item_id')
      .min('timestamp as requested_at')
      .where('status', 'requested')
      .groupBy('watchlist_item_id')
      .as('r')

    const query = this.knex('watchlist_items as wi')
      .join(requested, 'wi.id', 'r.watchlist_item_id')
      .leftJoin('watchlist_status_history as h', function () {
        this.on('h.watchlist_item_id', '=', 'wi.id')
          .andOn('h.timestamp', '>', 'r.requested_at')
          .andOnIn('h.status', ['grabbed', 'notified'])
      })
      .whereIn('wi.type', ['movie', 'show'])
      .groupBy('wi.id', 'wi.type', 'r.requested_at')
      .select(
        'wi.type as content_type',
        this.knex.raw(
          `${this.getDateDiffSQL('MIN(h.timestamp)', 'r.requested_at')} as days_to_ready`,
        ),
      )

    if (days > 0) {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
      query.where('r.requested_at', '>=', cutoffDate.toISOString())
    }

    const rows: {
      content_type: string
      days_to_ready: number | string | null
    }[] = await query

    const groups = new Map<string, { durations: number[]; pending: number }>([
      ['movie', { durations: [], pending: 0 }],
      ['show', { durations: [], pending: 0 }],
    ])

    for (const row of rows) {
      const group = groups.get(String(row.content_type))
      if (!group) continue
      if (row.days_to_ready === null) {
        group.pending++
        continue
      }
      const daysToReady = Number(row.days_to_ready)
      if (daysToReady > 0) group.durations.push(daysToReady)
    }

    const round = (value: number) => Number(value.toFixed(2))

    return Array.from(groups.entries()).map(
      ([contentType, { durations, pending }]) => {
        const sorted = durations.sort((a, b) => a - b)
        const n = sorted.length
        if (n === 0) {
          return {
            content_type: contentType,
            avg_days: 0,
            min_days: 0,
            max_days: 0,
            median_days: 0,
            p90_days: 0,
            count: 0,
            pending,
          }
        }
        const mid = Math.floor(n / 2)
        const median =
          n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
        return {
          content_type: contentType,
          avg_days: round(sorted.reduce((sum, d) => sum + d, 0) / n),
          min_days: round(sorted[0]),
          max_days: round(sorted[n - 1]),
          median_days: round(median),
          p90_days: round(sorted[Math.ceil(0.9 * n) - 1]),
          count: n,
          pending,
        }
      },
    )
  } catch (error) {
    this.log.error({ error }, 'Error calculating time from request to ready:')
    throw error
  }
}

/**
 * Calculates average, minimum, and maximum days between all direct status transitions for watchlist items, grouped by transition type and content type.
 *
 * For each unique (from_status, to_status, content_type) combination, applies robust outlier filtering and includes only transitions with at least two valid samples. Results are sorted by sample count in descending order.
 *
 * @param days - Number of days to look back for transitions (default: 30)
 * @returns An array of objects with transition details and time statistics.
 */
export async function getDetailedStatusTransitionMetrics(
  this: DatabaseService,
  days = 30,
): Promise<
  {
    from_status: string
    to_status: string
    content_type: string
    avg_days: number
    min_days: number
    max_days: number
    count: number
  }[]
> {
  try {
    const isAllTime = days === 0

    this.log.debug(
      `Calculating detailed status transition metrics ${isAllTime ? '(all time)' : `(last ${days} days)`}`,
    )

    let cutoffDate: Date | undefined
    if (!isAllTime) {
      cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)
    }

    // Step 1: Get all direct status transitions using Knex
    let transitionsQuery = this.knex('watchlist_status_history as h1')
      .select(
        'h1.status as from_status',
        'h2.status as to_status',
        'w.type as content_type',
      )
      .select(
        this.knex.raw(
          `${this.getDateDiffSQL('h2.timestamp', 'h1.timestamp')} as days_between`,
        ),
      )
      .join('watchlist_status_history as h2', function () {
        this.on('h1.watchlist_item_id', '=', 'h2.watchlist_item_id').andOn(
          'h2.timestamp',
          '>',
          'h1.timestamp',
        )
      })
      .join('watchlist_items as w', 'h1.watchlist_item_id', 'w.id')
    if (!isAllTime && cutoffDate) {
      transitionsQuery = transitionsQuery.where(
        'h2.timestamp',
        '>=',
        cutoffDate.toISOString(),
      )
    }
    transitionsQuery = transitionsQuery
      .whereRaw('h1.status != h2.status')
      .whereRaw(`${this.getDateDiffSQL('h2.timestamp', 'h1.timestamp')} >= 0`)
      .whereRaw(`${this.getDateDiffSQL('h2.timestamp', 'h1.timestamp')} < 1`)
      .whereNotExists(function () {
        this.select('*')
          .from('watchlist_status_history as h3')
          .whereRaw('h3.watchlist_item_id = h1.watchlist_item_id')
          .whereRaw('h3.timestamp > h1.timestamp')
          .whereRaw('h3.timestamp < h2.timestamp')
      })

    const transitions = await transitionsQuery

    // Step 2: Group transitions by transition type and apply outlier filtering
    const transitionGroups = new Map<string, number[]>()

    for (const row of transitions) {
      const key = `${row.from_status}|${row.to_status}|${row.content_type}`
      const daysBetween = Number(row.days_between)

      if (!Number.isFinite(daysBetween) || daysBetween < 0) continue

      if (!transitionGroups.has(key)) {
        transitionGroups.set(key, [])
      }
      const timeArray = transitionGroups.get(key)
      if (timeArray) {
        timeArray.push(daysBetween)
      }
    }

    // Step 3: Apply outlier filtering and calculate statistics
    const results: Array<{
      from_status: string
      to_status: string
      content_type: string
      avg_days: number
      min_days: number
      max_days: number
      count: number
    }> = []

    for (const [key, times] of transitionGroups.entries()) {
      if (times.length < 2) continue // Minimum sample size

      const [fromStatus, toStatus, contentType] = key.split('|')

      // Sort for percentile calculations
      times.sort((a, b) => a - b)

      // Calculate percentiles for outlier detection
      const q1Index = Math.floor(times.length * 0.25)
      const q3Index = Math.floor(times.length * 0.75)

      const q1 = times[q1Index] || times[0]
      const q3 = times[q3Index] || times[times.length - 1]

      // Apply multi-method outlier filtering for time data
      // Use multiple methods to catch extreme outliers

      // Method 1: Stricter percentile bounds (2nd-98th percentile for initial filtering)
      const p2Index = Math.floor(times.length * 0.02)
      const p98Index = Math.floor(times.length * 0.98)
      const p2 = times[p2Index] || times[0]
      const p98 = times[p98Index] || times[times.length - 1]

      // Method 2: Modified Z-score approach using median for robustness
      const median = times[Math.floor(times.length / 2)]
      const medianAbsoluteDeviations = times.map((time) =>
        Math.abs(time - median),
      )
      medianAbsoluteDeviations.sort((a, b) => a - b)
      const mad =
        medianAbsoluteDeviations[
          Math.floor(medianAbsoluteDeviations.length / 2)
        ]

      // Method 3: Conservative IQR bounds (1.0x multiplier for time data)
      const iqr = q3 - q1

      // Method 4: Transition-specific reasonable bounds
      const maxReasonableDays =
        fromStatus === 'grabbed' && toStatus === 'notified' ? 90 : 180

      const filteredTimes = times.filter((time) => {
        // Apply all methods - a value must pass all checks
        const passesPercentile = time >= p2 && time <= p98
        const passesMAD = mad === 0 || Math.abs(time - median) <= 3 * mad // Modified Z-score < 3
        const passesIQR = time >= q1 - 1.0 * iqr && time <= q3 + 1.0 * iqr
        const passesReasonableBounds = time <= maxReasonableDays

        return (
          passesPercentile && passesMAD && passesIQR && passesReasonableBounds
        )
      })

      if (filteredTimes.length === 0) continue

      // Log outlier filtering results for debugging
      if (times.length !== filteredTimes.length) {
        const removedCount = times.length - filteredTimes.length
        const percentRemoved = ((removedCount / times.length) * 100).toFixed(1)
        this.log.debug(
          {
            originalRange: `${times[0].toFixed(2)} - ${times[times.length - 1].toFixed(2)} days`,
            filteredRange: `${filteredTimes[0].toFixed(2)} - ${filteredTimes[filteredTimes.length - 1].toFixed(2)} days`,
            originalMedian: times[Math.floor(times.length / 2)].toFixed(2),
            filteredMedian:
              filteredTimes[Math.floor(filteredTimes.length / 2)].toFixed(2),
          },
          `Outlier filtering for ${fromStatus}->${toStatus} (${contentType}): removed ${removedCount}/${times.length} (${percentRemoved}%) data points`,
        )
      }

      // Calculate statistics
      const sum = filteredTimes.reduce((acc, time) => acc + time, 0)
      const avgDays = sum / filteredTimes.length
      // arrays are already sorted -> first / last are cheap & safe
      const minDays = filteredTimes[0]
      const maxDays = filteredTimes[filteredTimes.length - 1]

      results.push({
        from_status: fromStatus,
        to_status: toStatus,
        content_type: contentType,
        avg_days: avgDays,
        min_days: minDays,
        max_days: maxDays,
        count: filteredTimes.length,
      })
    }

    // Sort by count descending
    results.sort((a, b) => b.count - a.count)

    this.log.debug(
      `Calculated transition metrics for ${results.length} status pairs`,
    )

    return results
  } catch (error) {
    this.log.error(
      { error },
      'Error calculating detailed status transition metrics',
    )
    throw error
  }
}

/**
 * Calculates average, minimum, and maximum time in days from when a watchlist item is added to when it becomes available, grouped by content type.
 *
 * Only includes movies that have reached 'available' status and shows that have reached 'ended' status. Returns an array of metrics for each content type.
 *
 * @param days - Number of days to look back for notifications (default: 30)
 * @returns Array of objects containing content type, average days, minimum days, maximum days, and count of items.
 */
export async function getAverageTimeToAvailability(
  this: DatabaseService,
  days = 30,
): Promise<
  {
    content_type: string
    avg_days: number
    min_days: number
    max_days: number
    count: number
  }[]
> {
  // Define type for the raw SQL query result
  type AvailabilityStatsRow = {
    content_type: string
    avg_days: number
    min_days: number
    max_days: number
    count: number
  }

  const isAllTime = days === 0

  this.log.debug(
    `Calculating average time from addition to availability ${isAllTime ? '(all time)' : `(last ${days} days)`}`,
  )

  let cutoffISO: string | undefined
  if (!isAllTime) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    cutoffISO = cutoffDate.toISOString()
  }

  // Execute raw SQL query with CTEs for first add and first notification timestamps
  const availabilityDateDiffFunction = this.getDateDiffSQL(
    'n.first_notification',
    'a.created_at',
  )

  // Build date filter clause conditionally
  const dateFilterClause = isAllTime ? '' : `AND h.timestamp >= '${cutoffISO}'`

  const results = await this.knex.raw<AvailabilityStatsRow[]>(`
    WITH first_added AS (
      -- Get initial addition timestamp for each item
      SELECT
        w.id,
        w.type AS content_type,
        w.created_at
      FROM watchlist_items w
      WHERE w.created_at IS NOT NULL
    ),
    first_notified AS (
      -- Get first notification timestamp for each item within the time period
      SELECT
        h.watchlist_item_id,
        MIN(h.timestamp) AS first_notification
      FROM watchlist_status_history h
      WHERE h.status = 'notified'
      ${dateFilterClause}
      GROUP BY h.watchlist_item_id
    )
    -- Join and calculate statistics on the time difference
    SELECT
      a.content_type,
      AVG(${availabilityDateDiffFunction}) AS avg_days,
      MIN(${availabilityDateDiffFunction}) AS min_days,
      MAX(${availabilityDateDiffFunction}) AS max_days,
      COUNT(*) AS count
    FROM first_added a
    JOIN first_notified n ON a.id = n.watchlist_item_id
    WHERE
      -- Filter to only include items that have reached availability
      (a.content_type = 'movie' AND EXISTS (
        SELECT 1 FROM watchlist_items w
        WHERE w.id = a.id AND w.movie_status = 'available'
      ))
      OR
      (a.content_type = 'show' AND EXISTS (
        SELECT 1 FROM watchlist_items w
        WHERE w.id = a.id AND w.series_status = 'ended'
      ))
    GROUP BY a.content_type
  `)

  // Format and return the results
  const availabilityRawResults =
    this.extractRawQueryRows<AvailabilityStatsRow>(results)
  const formattedResults = availabilityRawResults.map(
    (row: AvailabilityStatsRow) => ({
      content_type: String(row.content_type),
      avg_days: Number(row.avg_days),
      min_days: Number(row.min_days),
      max_days: Number(row.max_days),
      count: Number(row.count),
    }),
  )

  this.log.debug(
    `Calculated time-to-availability metrics for ${formattedResults.length} content types`,
  )

  return formattedResults
}
