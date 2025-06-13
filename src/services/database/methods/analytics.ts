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
    .groupBy('key', 'title', 'thumb')
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
    .groupBy('key', 'title', 'thumb')
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

    // Define type for the raw SQL query result
    type GrabbedToNotifiedRow = {
      content_type: string
      avg_days: number
      min_days: number
      max_days: number
      count: number
    }

    // Execute raw SQL query with CTEs for better performance and readability
    const dateDiffFunction = this.getDateDiffSQL(
      'n.first_notified',
      'g.first_grabbed',
    )

    const results = await this.knex.raw(`
    WITH grabbed_status AS (
      -- Find the earliest "grabbed" status timestamp for each watchlist item
      SELECT
        h.watchlist_item_id,
        MIN(h.timestamp) AS first_grabbed
      FROM watchlist_status_history h
      WHERE h.status = 'grabbed'
      GROUP BY h.watchlist_item_id
    ),
    notified_status AS (
      -- Find the earliest "notified" status timestamp for each watchlist item
      SELECT
        h.watchlist_item_id,
        MIN(h.timestamp) AS first_notified
      FROM watchlist_status_history h
      WHERE h.status = 'notified'
      GROUP BY h.watchlist_item_id
    )
    -- Join these with watchlist items and calculate time differences
    SELECT
      w.type AS content_type,
      AVG(${dateDiffFunction}) AS avg_days,
      MIN(${dateDiffFunction}) AS min_days,
      MAX(${dateDiffFunction}) AS max_days,
      COUNT(*) AS count
    FROM watchlist_items w
    JOIN grabbed_status g ON w.id = g.watchlist_item_id
    JOIN notified_status n ON w.id = n.watchlist_item_id
    WHERE 
      -- Ensure notified comes after grabbed (no negative times)
      n.first_notified > g.first_grabbed
      -- Filter to just movies and shows
      AND (
        (w.type = 'movie') OR
        (w.type = 'show')
      )
    GROUP BY w.type
  `)

    // Format and return the results
    const rawResults = this.extractRawQueryRows<GrabbedToNotifiedRow>(results)
    const formattedResults = rawResults.map((row: GrabbedToNotifiedRow) => ({
      content_type: String(row.content_type),
      avg_days: Number(row.avg_days),
      min_days: Number(row.min_days),
      max_days: Number(row.max_days),
      count: Number(row.count),
    }))

    this.log.debug(
      `Calculated time metrics for ${formattedResults.length} content types`,
    )

    return formattedResults
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

    // Define the type for the raw transitions
    type RawTransition = {
      from_status: string
      to_status: string
      content_type: string
      days_between: number | string
    }

    // First, get all the direct transitions without filtering
    const transitionDateDiffFunction = this.getDateDiffSQL(
      'h2.timestamp',
      'h1.timestamp',
    )

    const rawTransitions = await this.knex.raw(`
        WITH status_pairs AS (
          SELECT 
            h1.status AS from_status,
            h2.status AS to_status,
            w.type AS content_type,
            ${transitionDateDiffFunction} AS days_between
          FROM watchlist_status_history h1
          JOIN watchlist_status_history h2 
            ON h1.watchlist_item_id = h2.watchlist_item_id 
            AND h2.timestamp > h1.timestamp
          JOIN watchlist_items w ON h1.watchlist_item_id = w.id
          WHERE h1.status != h2.status
          AND NOT EXISTS (
            SELECT 1 FROM watchlist_status_history h3
            WHERE h3.watchlist_item_id = h1.watchlist_item_id
            AND h3.timestamp > h1.timestamp 
            AND h3.timestamp < h2.timestamp
          )
        )
        SELECT 
          from_status,
          to_status,
          content_type,
          days_between
        FROM status_pairs
      `)

    const transitionGroups = new Map<string, number[]>()
    const rawTransitionResults =
      this.extractRawQueryRows<RawTransition>(rawTransitions)

    // Process and group raw transitions with numeric coercion and validation
    for (const row of rawTransitionResults) {
      const key = `${row.from_status}|${row.to_status}|${row.content_type}`

      const daysBetweenRaw =
        typeof row.days_between === 'number'
          ? row.days_between
          : Number(row.days_between)

      // Skip invalid or negative values
      if (!Number.isFinite(daysBetweenRaw) || daysBetweenRaw < 0) {
        this.log.warn(
          `Skipping invalid days_between value: ${row.days_between}`,
          {
            from_status: row.from_status,
            to_status: row.to_status,
            content_type: row.content_type,
          },
        )
        continue
      }

      if (!transitionGroups.has(key)) {
        transitionGroups.set(key, [])
      }
      transitionGroups.get(key)?.push(daysBetweenRaw)
    }

    // Process each group to filter outliers and calculate statistics
    const results: Array<{
      from_status: string
      to_status: string
      content_type: string
      count: number
      avg_days: number
      min_days: number
      max_days: number
    }> = []

    for (const [key, values] of transitionGroups.entries()) {
      if (values.length === 0) continue

      // Values are now guaranteed to be numbers
      values.sort((a, b) => a - b)

      // Calculate quartiles for IQR
      const q1Idx = Math.floor(values.length * 0.25)
      const q3Idx = Math.floor(values.length * 0.75)
      const q1 = values[q1Idx]
      const q3 = values[q3Idx]
      const iqr = q3 - q1

      // Filter outliers using IQR method
      const filteredValues = values.filter(
        (v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr,
      )

      if (filteredValues.length === 0) continue

      // Calculate statistics with guaranteed numeric values
      const [from_status, to_status, content_type] = key.split('|')
      const sum = filteredValues.reduce((acc, val) => acc + val, 0)
      const avg_days = sum / filteredValues.length
      const min_days = Math.min(...filteredValues)
      const max_days = Math.max(...filteredValues)

      results.push({
        from_status,
        to_status,
        content_type,
        count: filteredValues.length,
        avg_days,
        min_days,
        max_days,
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
