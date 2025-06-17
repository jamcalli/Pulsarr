import type { DatabaseService } from '@services/database.service.js'

/**
 * Retrieves the top genres across all watchlist items
 *
 * @param limit - Maximum number of genres to return (default: 10)
 * @returns Promise resolving to array of genres with their occurrence counts
 */
export async function getTopGenres(
  this: DatabaseService,
  limit = 10,
): Promise<{ genre: string; count: number }[]> {
  try {
    // First, retrieve all watchlist items that have genre information
    const items = await this.knex('watchlist_items')
      .whereNotNull('genres')
      .where('genres', '!=', '[]')
      .select('genres')

    this.log.debug(`Processing genres from ${items.length} watchlist items`)

    // Count occurrences of each genre
    const genreCounts: Record<string, number> = {}
    for (const item of items) {
      try {
        let genres: string[] = []
        try {
          const parsed = this.safeJsonParse(
            item.genres,
            [],
            'watchlist_item.genres',
          )
          if (Array.isArray(parsed)) {
            genres = parsed
          }
        } catch (parseError) {
          this.log.debug('Skipping malformed genres JSON', {
            genres: item.genres,
          })
          continue
        }

        // Increment counts for each genre
        for (const genre of genres) {
          if (typeof genre === 'string' && genre.trim().length > 0) {
            const normalizedGenre = genre.trim()
            genreCounts[normalizedGenre] =
              (genreCounts[normalizedGenre] || 0) + 1
          }
        }
      } catch (err) {
        this.log.error('Error processing genre item:', err)
      }
    }

    // Sort genres by count and limit the results
    const sortedGenres = Object.entries(genreCounts)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    this.log.info(
      `Returning ${sortedGenres.length} top genres from ${Object.keys(genreCounts).length} total genres`,
    )
    return sortedGenres
  } catch (error) {
    this.log.error('Error in getTopGenres:', error)
    throw error
  }
}

/**
 * Retrieves the most watchlisted shows
 *
 * @param limit - Maximum number of shows to return (default: 10)
 * @returns Promise resolving to array of shows with title, count, and thumbnail
 */
export async function getMostWatchlistedShows(
  this: DatabaseService,
  limit = 10,
): Promise<{ title: string; count: number; thumb: string | null }[]> {
  const results = await this.knex('watchlist_items')
    .where('type', 'show')
    .select('title', 'thumb')
    .count('* as count')
    .groupBy('title', 'thumb')
    .orderBy('count', 'desc')
    .limit(limit)

  this.log.debug(`Retrieved ${results.length} most watchlisted shows`)

  return results.map((row) => ({
    title: String(row.title),
    count: Number(row.count),
    thumb: row.thumb ? String(row.thumb) : null,
  }))
}

/**
 * Retrieves the most watchlisted movies
 *
 * @param limit - Maximum number of movies to return (default: 10)
 * @returns Promise resolving to array of movies with title, count, and thumbnail
 */
export async function getMostWatchlistedMovies(
  this: DatabaseService,
  limit = 10,
): Promise<{ title: string; count: number; thumb: string | null }[]> {
  const results = await this.knex('watchlist_items')
    .where('type', 'movie')
    .select('title', 'thumb')
    .count('* as count')
    .groupBy('title', 'thumb')
    .orderBy('count', 'desc')
    .limit(limit)

  this.log.debug(`Retrieved ${results.length} most watchlisted movies`)

  return results.map((row) => ({
    title: String(row.title),
    count: Number(row.count),
    thumb: row.thumb ? String(row.thumb) : null,
  }))
}

/**
 * Retrieves users with the most watchlist items
 *
 * @param limit - Maximum number of users to return (default: 10)
 * @returns Promise resolving to array of users with name and item count
 */
export async function getUsersWithMostWatchlistItems(
  this: DatabaseService,
  limit = 10,
): Promise<{ name: string; count: number }[]> {
  const results = await this.knex('watchlist_items')
    .join('users', 'watchlist_items.user_id', '=', 'users.id')
    .select('users.name')
    .count('watchlist_items.id as count')
    .groupBy('users.id')
    .orderBy('count', 'desc')
    .limit(limit)

  return results.map((row) => ({
    name: String(row.name),
    count: Number(row.count),
  }))
}

/**
 * Retrieves the distribution of watchlist items by status
 *
 * @returns Promise resolving to array of statuses with their counts
 */
export async function getWatchlistStatusDistribution(
  this: DatabaseService,
): Promise<{ status: string; count: number }[]> {
  const historyItems = await this.knex
    .select('h.status')
    .count('* as count')
    .from('watchlist_status_history as h')
    .join(
      this.knex
        .select('watchlist_item_id')
        .max('timestamp as latest_timestamp')
        .from('watchlist_status_history')
        .groupBy('watchlist_item_id')
        .as('latest'),
      function () {
        this.on('h.watchlist_item_id', '=', 'latest.watchlist_item_id').andOn(
          'h.timestamp',
          '=',
          'latest.latest_timestamp',
        )
      },
    )
    .groupBy('h.status')
    .orderBy('count', 'desc')

  const itemsWithHistory = await this.knex('watchlist_status_history')
    .distinct('watchlist_item_id')
    .pluck('watchlist_item_id')

  const itemsWithoutHistory = await this.knex('watchlist_items')
    .whereNotIn('id', itemsWithHistory)
    .select('status')
    .count('* as count')
    .groupBy('status')
    .orderBy('count', 'desc')

  const combinedResults = new Map<string, number>()

  for (const item of historyItems) {
    combinedResults.set(String(item.status), Number(item.count))
  }

  for (const item of itemsWithoutHistory) {
    const status = String(item.status)
    const currentCount = combinedResults.get(status) || 0
    combinedResults.set(status, currentCount + Number(item.count))
  }

  this.log.debug(
    `Calculated status distribution across ${combinedResults.size} statuses`,
  )

  return Array.from(combinedResults.entries())
    .map(([status, count]) => ({
      status,
      count,
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Retrieves the distribution of watchlist items by content type
 *
 * @returns Promise resolving to array of content types with their counts
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
 * Retrieves recent activity statistics
 *
 * @param days - Number of days to look back (default: 30)
 * @returns Promise resolving to object with activity statistics
 */
export async function getRecentActivityStats(
  this: DatabaseService,
  days = 30,
): Promise<{
  new_watchlist_items: number
  status_changes: number
  notifications_sent: number
}> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoffDateStr = cutoffDate.toISOString()

  this.log.debug(
    `Calculating recent activity stats for period since ${cutoffDateStr}`,
  )

  const newItems = await this.knex('watchlist_items')
    .where('added', '>=', cutoffDateStr)
    .count('* as count')
    .first()

  const statusChanges = await this.knex('watchlist_status_history')
    .where('timestamp', '>=', cutoffDateStr)
    .count('* as count')
    .first()

  const notifications = await this.knex('notifications')
    .where('created_at', '>=', cutoffDateStr)
    .count('* as count')
    .first()

  const stats = {
    new_watchlist_items: Number(newItems?.count || 0),
    status_changes: Number(statusChanges?.count || 0),
    notifications_sent: Number(notifications?.count || 0),
  }

  this.log.debug('Computed recent activity stats:', stats)

  return stats
}

/**
 * Retrieves activity statistics by instance
 *
 * @returns Promise resolving to array of instance activity statistics
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
    .groupBy('sonarr_instances.id')

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
    .groupBy('radarr_instances.id')

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
 * Retrieves metrics on average time from "grabbed" to "notified" status
 *
 * @returns Promise resolving to array of average time metrics by content type
 */
export async function getAverageTimeFromGrabbedToNotified(
  this: DatabaseService,
): Promise<
  {
    content_type: string
    avg_days: number
    min_days: number
    max_days: number
    count: number
  }[]
> {
  try {
    this.log.debug('Calculating average time from grabbed to notified status')

    // Step 1: Get grabbed timestamps using Knex
    const grabbedTimestamps = await this.knex('watchlist_status_history')
      .select('watchlist_item_id')
      .min('timestamp as first_grabbed')
      .where('status', 'grabbed')
      .groupBy('watchlist_item_id')

    // Step 2: Get notified timestamps using Knex
    const notifiedTimestamps = await this.knex('watchlist_status_history')
      .select('watchlist_item_id')
      .min('timestamp as first_notified')
      .where('status', 'notified')
      .groupBy('watchlist_item_id')

    // Step 3: Join the results and calculate time differences
    const rawTimes: Array<{ content_type: string; days_between: number }> = []

    // Create maps for faster lookup
    const grabbedMap = new Map<number, string>()
    const notifiedMap = new Map<number, string>()

    for (const row of grabbedTimestamps) {
      grabbedMap.set(Number(row.watchlist_item_id), String(row.first_grabbed))
    }

    for (const row of notifiedTimestamps) {
      notifiedMap.set(Number(row.watchlist_item_id), String(row.first_notified))
    }

    // Get watchlist items and calculate time differences
    const watchlistItems = await this.knex('watchlist_items')
      .select('id', 'type')
      .whereIn('type', ['movie', 'show'])

    for (const item of watchlistItems) {
      const itemId = Number(item.id)
      const grabbedTime = grabbedMap.get(itemId)
      const notifiedTime = notifiedMap.get(itemId)

      if (!grabbedTime || !notifiedTime) continue

      // Ensure notified comes after grabbed
      if (notifiedTime <= grabbedTime) continue

      // Calculate time difference using our helper method
      const grabbedDate = new Date(grabbedTime)
      const notifiedDate = new Date(notifiedTime)
      const daysBetween =
        (notifiedDate.getTime() - grabbedDate.getTime()) / (1000 * 60 * 60 * 24)

      // Apply basic filtering - exclude negative times and extreme outliers
      if (daysBetween < 0 || daysBetween > 30) continue // Only include transitions under 30 days

      rawTimes.push({
        content_type: String(item.type),
        days_between: daysBetween,
      })
    }

    // Step 4: Group by content type and apply outlier filtering in JavaScript
    // (This is more database-agnostic than using percentile functions)
    const groupedTimes = new Map<string, number[]>()

    for (const row of rawTimes) {
      const contentType = String(row.content_type)
      const daysBetween = Number(row.days_between)

      if (!Number.isFinite(daysBetween) || daysBetween < 0) continue

      if (!groupedTimes.has(contentType)) {
        groupedTimes.set(contentType, [])
      }
      const timeArray = groupedTimes.get(contentType)
      if (timeArray) {
        timeArray.push(daysBetween)
      }
    }

    // Step 5: Apply outlier filtering and calculate statistics
    const results: Array<{
      content_type: string
      avg_days: number
      min_days: number
      max_days: number
      count: number
    }> = []

    for (const [contentType, times] of groupedTimes.entries()) {
      if (times.length < 5) continue // Minimum sample size

      // Sort for percentile calculations
      times.sort((a, b) => a - b)

      // Calculate percentiles for outlier detection
      const p5Index = Math.floor(times.length * 0.05)
      const p95Index = Math.floor(times.length * 0.95)
      const q1Index = Math.floor(times.length * 0.25)
      const q3Index = Math.floor(times.length * 0.75)

      const p5 = times[p5Index] || times[0]
      const p95 = times[p95Index] || times[times.length - 1]
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

      const filteredTimes = times.filter((time) => {
        // Apply all three methods - a value must pass all checks
        const passesPercentile = time >= p2 && time <= p98
        const passesMAD = mad === 0 || Math.abs(time - median) <= 3 * mad // Modified Z-score < 3
        const passesIQR = time >= q1 - 1.0 * iqr && time <= q3 + 1.0 * iqr
        const passesReasonableBounds = time <= 30 // Nothing should take more than 30 days (in days)

        // Debug logging for extreme values
        if (time > 7) {
          this.log.debug(
            `Value above 7 days detected: ${time.toFixed(2)} days`,
            {
              passesPercentile,
              passesMAD,
              passesIQR,
              passesReasonableBounds,
              median: median.toFixed(2),
              mad: mad.toFixed(2),
              q1: q1.toFixed(2),
              q3: q3.toFixed(2),
            },
          )
        }

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
          `Outlier filtering for ${contentType}: removed ${removedCount}/${times.length} (${percentRemoved}%) data points`,
          {
            originalRange: `${Math.min(...times).toFixed(2)} - ${Math.max(...times).toFixed(2)} days`,
            filteredRange: `${Math.min(...filteredTimes).toFixed(2)} - ${Math.max(...filteredTimes).toFixed(2)} days`,
            originalMedian: times[Math.floor(times.length / 2)].toFixed(2),
            filteredMedian:
              filteredTimes[Math.floor(filteredTimes.length / 2)].toFixed(2),
          },
        )
      }

      // Calculate statistics
      const sum = filteredTimes.reduce((acc, time) => acc + time, 0)
      const avgDays = sum / filteredTimes.length
      const minDays = Math.min(...filteredTimes)
      const maxDays = Math.max(...filteredTimes)

      results.push({
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
      `Calculated time metrics for ${results.length} content types`,
    )

    return results
  } catch (error) {
    this.log.error('Error calculating time from grabbed to notified:', error)
    throw error
  }
}

/**
 * Retrieves detailed metrics on all status transitions
 *
 * @returns Promise resolving to array of detailed status transition metrics
 */
export async function getDetailedStatusTransitionMetrics(
  this: DatabaseService,
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
    this.log.debug('Calculating detailed status transition metrics')

    // Step 1: Get all direct status transitions using Knex
    const transitionsQuery = this.knex('watchlist_status_history as h1')
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
      if (times.length < 3) continue // Minimum sample size

      const [fromStatus, toStatus, contentType] = key.split('|')

      // Sort for percentile calculations
      times.sort((a, b) => a - b)

      // Calculate percentiles for outlier detection
      const p5Index = Math.floor(times.length * 0.05)
      const p95Index = Math.floor(times.length * 0.95)
      const q1Index = Math.floor(times.length * 0.25)
      const q3Index = Math.floor(times.length * 0.75)

      const p5 = times[p5Index] || times[0]
      const p95 = times[p95Index] || times[times.length - 1]
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
          `Outlier filtering for ${fromStatus}->${toStatus} (${contentType}): removed ${removedCount}/${times.length} (${percentRemoved}%) data points`,
          {
            originalRange: `${Math.min(...times).toFixed(2)} - ${Math.max(...times).toFixed(2)} days`,
            filteredRange: `${Math.min(...filteredTimes).toFixed(2)} - ${Math.max(...filteredTimes).toFixed(2)} days`,
            originalMedian: times[Math.floor(times.length / 2)].toFixed(2),
            filteredMedian:
              filteredTimes[Math.floor(filteredTimes.length / 2)].toFixed(2),
          },
        )
      }

      // Calculate statistics
      const sum = filteredTimes.reduce((acc, time) => acc + time, 0)
      const avgDays = sum / filteredTimes.length
      const minDays = Math.min(...filteredTimes)
      const maxDays = Math.max(...filteredTimes)

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
      'Error calculating detailed status transition metrics:',
      error,
    )
    throw error
  }
}

/**
 * Retrieves metrics on the average time from addition to availability
 *
 * @returns Promise resolving to array of time-to-availability metrics by content type
 */
export async function getAverageTimeToAvailability(
  this: DatabaseService,
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

  this.log.debug('Calculating average time from addition to availability')

  // Execute raw SQL query with CTEs for first add and first notification timestamps
  const availabilityDateDiffFunction = this.getDateDiffSQL(
    'n.first_notification',
    this.isPostgreSQL() ? 'a.added::timestamp' : 'a.added',
  )

  const results = await this.knex.raw<AvailabilityStatsRow[]>(`
    WITH first_added AS (
      -- Get initial addition timestamp for each item
      SELECT
        w.id,
        w.type AS content_type,
        w.added
      FROM watchlist_items w
      WHERE w.added IS NOT NULL
    ),
    first_notified AS (
      -- Get first notification timestamp for each item
      SELECT
        h.watchlist_item_id,
        MIN(h.timestamp) AS first_notification
      FROM watchlist_status_history h
      WHERE h.status = 'notified'
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

/**
 * Retrieves data for visualizing status flow (Sankey diagram)
 *
 * @returns Promise resolving to array of status flow data points
 */
export async function getStatusFlowData(this: DatabaseService): Promise<
  {
    from_status: string
    to_status: string
    content_type: string
    count: number
    avg_days: number
  }[]
> {
  try {
    this.log.debug('Retrieving status flow data for visualization')

    // Define type for the raw SQL query result
    type StatusFlowRow = {
      from_status: string
      to_status: string
      content_type: string
      count: number
      avg_days: number
    }

    // Execute raw SQL query to get status transition data
    const statusFlowDateDiffFunction = this.getDateDiffSQL(
      'h2.timestamp',
      'h1.timestamp',
    )

    const results = await this.knex.raw<StatusFlowRow[]>(`
    WITH status_transitions AS (
      -- For each item, find all pairs of consecutive status changes
      SELECT 
        h1.status AS from_status,
        h2.status AS to_status,
        w.type AS content_type,
        ${statusFlowDateDiffFunction} AS days_between
      FROM watchlist_status_history h1
      JOIN watchlist_status_history h2 ON h1.watchlist_item_id = h2.watchlist_item_id AND h2.timestamp > h1.timestamp
      JOIN watchlist_items w ON h1.watchlist_item_id = w.id
      WHERE h1.status != h2.status
      -- Ensure there are no intermediate status changes
      AND NOT EXISTS (
        SELECT 1 FROM watchlist_status_history h3
        WHERE h3.watchlist_item_id = h1.watchlist_item_id
        AND h3.timestamp > h1.timestamp AND h3.timestamp < h2.timestamp
      )
    )
    -- Aggregate to get counts and average times for each transition type
    SELECT 
      from_status,
      to_status,
      content_type,
      count(*) AS count,
      avg(days_between) AS avg_days
    FROM status_transitions
    GROUP BY from_status, to_status, content_type
    ORDER BY count DESC
  `)

    // Format and return the results
    const statusFlowRawResults =
      this.extractRawQueryRows<StatusFlowRow>(results)
    const formattedResults = statusFlowRawResults.map((row: StatusFlowRow) => ({
      from_status: String(row.from_status),
      to_status: String(row.to_status),
      content_type: String(row.content_type),
      count: Number(row.count),
      avg_days: Number(row.avg_days),
    }))

    this.log.debug(
      `Retrieved ${formattedResults.length} status flow data points`,
    )

    return formattedResults
  } catch (error) {
    this.log.error('Error calculating status flow data:', error)
    throw error
  }
}
