/**
 * Apprise HTML Templates
 *
 * Pure template builders for Apprise notifications.
 * No state, no side effects - just HTML string generation.
 */

import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  MediaNotification,
  SystemNotification,
} from '@root/types/discord.types.js'

/** Pulsarr icon URL for notification attachments */
export const PULSARR_ICON_URL =
  'https://raw.githubusercontent.com/jamcalli/Pulsarr/master/assets/icons/pulsarr-lg.png'

/**
 * Sanitizes HTML content to prevent XSS attacks.
 */
export function escapeHtml(str: string): string {
  if (!str) return ''
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
    '`': '&#x60;',
  }
  return str.replace(/[&<>'"`]/g, (c) => escapeMap[c] || c)
}

/**
 * Common HTML wrapper for notifications with Pulsarr styling.
 */
export function htmlWrapper(content: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #000000; border-radius: 5px; background-color: #48a9a6; color: #000000; box-shadow: 4px 4px 0px 0px #000000;">
      ${content}
      <hr style="border: none; border-top: 1px solid #000000; margin: 20px 0;">
      <p style="color:#000000; font-size:0.9em; text-align: center; font-weight: 500;">Powered by Pulsarr</p>
    </div>
    `
}

/**
 * Creates poster HTML block if poster URL is available.
 */
function createPosterHtml(
  posterUrl: string | undefined,
  title: string,
): string {
  if (!posterUrl) return ''
  return `<div style="text-align: center; margin-bottom: 20px;">
       <img src="${posterUrl}" alt="${escapeHtml(title)} poster" style="max-width: 200px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
     </div>`
}

/**
 * Creates HTML content for a media notification.
 */
export function createMediaNotificationHtml(notification: MediaNotification): {
  htmlBody: string
  textBody: string
  title: string
} {
  const emoji = notification.type === 'movie' ? '🎬' : '📺'
  const title = `${emoji} ${notification.title}`

  const posterHtml = createPosterHtml(
    notification.posterUrl,
    notification.title,
  )

  let htmlBody: string
  let textBody: string

  if (notification.type === 'show' && notification.episodeDetails) {
    const { episodeDetails } = notification

    if (
      episodeDetails.seasonNumber !== undefined &&
      episodeDetails.episodeNumber !== undefined
    ) {
      // Single episode release
      const seasonNum = episodeDetails.seasonNumber.toString().padStart(2, '0')
      const episodeNum = episodeDetails.episodeNumber
        .toString()
        .padStart(2, '0')
      const episodeId = `S${seasonNum}E${episodeNum}`
      const episodeTitle = episodeDetails.title
        ? ` - "${episodeDetails.title}"`
        : ''

      const episodeContent = `
        ${posterHtml}
        <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${escapeHtml(notification.title)}</h3>
          <p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Episode:</strong> ${escapeHtml(episodeId)}${escapeHtml(episodeTitle)}</p>
          ${
            episodeDetails.overview
              ? `<p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Overview:</strong> ${escapeHtml(episodeDetails.overview)}</p>`
              : ''
          }
          ${
            episodeDetails.airDateUtc
              ? `<p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Air Date:</strong> ${escapeHtml(new Date(episodeDetails.airDateUtc).toLocaleDateString())}</p>`
              : ''
          }
        </div>
      `

      htmlBody = htmlWrapper(episodeContent)

      textBody = `New Episode Available\n\n${notification.title}\nEpisode: ${episodeId}${episodeTitle}`
      if (episodeDetails.overview) {
        textBody += `\nOverview: ${episodeDetails.overview}`
      }
      if (episodeDetails.airDateUtc) {
        const airDate = new Date(episodeDetails.airDateUtc).toLocaleDateString()
        textBody += `\nAir Date: ${airDate}`
      }
    } else if (episodeDetails.seasonNumber !== undefined) {
      // Bulk season release
      const seasonContent = `
        ${posterHtml}
        <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${escapeHtml(notification.title)}</h3>
          <p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Season Added:</strong> Season ${escapeHtml(String(episodeDetails.seasonNumber))}</p>
        </div>
      `

      htmlBody = htmlWrapper(seasonContent)
      textBody = `New Season Available\n\n${notification.title}\nSeason Added: Season ${episodeDetails.seasonNumber}`
    } else {
      // Fallback
      const fallbackContent = `
        ${posterHtml}
        <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
          <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${escapeHtml(notification.title)}</h3>
          <p style="font-weight: 500; color: #ffffff;">New content is now available to watch!</p>
        </div>
      `

      htmlBody = htmlWrapper(fallbackContent)
      textBody = `New Content Available\n\n${notification.title}\nNew content is now available to watch!`
    }
  } else {
    // Movie notification
    const movieContent = `
      ${posterHtml}
      <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
        <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${escapeHtml(notification.title)}</h3>
        <p style="font-weight: 500; color: #ffffff;">Movie available to watch!</p>
      </div>
    `

    htmlBody = htmlWrapper(movieContent)
    textBody = `Movie Available\n\n${notification.title}\nMovie available to watch!`
  }

  textBody += '\n\n- Pulsarr'

  return { htmlBody, textBody, title }
}

/**
 * Creates HTML content for a system notification (approvals).
 */
export function createSystemNotificationHtml(
  notification: SystemNotification,
): { htmlBody: string; textBody: string } {
  const fields = Object.fromEntries(
    notification.embedFields.map((field) => [field.name, field.value]),
  )

  // Main Content Card
  const posterHtml = notification.posterUrl
    ? `<div style="text-align: center; margin-bottom: 15px;">
         <img src="${notification.posterUrl}" alt="${escapeHtml(fields.Content || notification.title)} poster" style="max-width: 150px; border-radius: 5px; border: 2px solid #000000; box-shadow: 2px 2px 0px 0px #000000;">
       </div>`
    : ''

  const contentCard = `
    <div style="margin-bottom: 20px; padding: 20px; background-color: #212121; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      ${posterHtml}
      <h3 style="margin-top: 0; color: #ffffff; font-weight: 700; text-align: center;">${escapeHtml(fields.Content || 'Unknown Content')}</h3>
      <div style="display: flex; justify-content: center; gap: 20px; margin-top: 15px;">
        <div style="text-align: center;">
          <div style="color: #ffffff; font-weight: 700; font-size: 14px;">TYPE</div>
          <div style="color: #ffffff; font-weight: 500;">${escapeHtml(fields.Type || 'Unknown')}</div>
        </div>
      </div>
    </div>
  `

  // Request Details Card
  const requestCard = `
    <div style="margin-bottom: 20px; padding: 20px; background-color: #212121; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <h4 style="margin-top: 0; color: #ffffff; font-weight: 700; border-bottom: 1px solid #343746; padding-bottom: 5px;">Request Details</h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
        <div>
          <div style="color: #ffffff; font-weight: 700; font-size: 14px;">REQUESTED BY</div>
          <div style="color: #ffffff; font-weight: 500;">${escapeHtml(fields['Requested by'] || 'Unknown')}</div>
        </div>
        <div>
          <div style="color: #ffffff; font-weight: 700; font-size: 14px;">PENDING REQUESTS</div>
          <div style="color: #ffffff; font-weight: 500;">${escapeHtml(fields['Total pending'] || '0').replace(' requests', ' awaiting review')}</div>
        </div>
      </div>
      ${
        fields.Reason
          ? `
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #343746;">
        <div style="color: #ffffff; font-weight: 700; font-size: 14px;">REASON FOR APPROVAL</div>
        <div style="color: #ffffff; font-weight: 500; margin-top: 5px;">${escapeHtml(fields.Reason)}</div>
      </div>
      `
          : ''
      }
    </div>
  `

  // Action Card
  const actionCard = fields['Action Required']
    ? `
    <div style="margin-bottom: 20px; padding: 15px; background-color: #212121; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <div style="color: #ffffff; font-weight: 700; text-align: center;">${escapeHtml(fields['Action Required'])}</div>
    </div>
  `
    : ''

  // Build text body
  let textBody = 'Content Approval Required\n\n'
  textBody += `${fields.Content || 'Unknown Content'}\n`
  textBody += `Type: ${fields.Type || 'Unknown'}\n\n`
  textBody += `Requested by: ${fields['Requested by'] || 'Unknown'}\n`
  textBody += `Total pending: ${fields['Total pending'] || '0'}\n`
  if (fields.Reason) textBody += `Reason: ${fields.Reason}\n`
  if (fields['Action Required']) textBody += `\n${fields['Action Required']}\n`
  textBody += '\n- Pulsarr'

  // Create complete HTML content
  const systemContent = `
    <h2 style="color: #000000; margin-top: 0; font-weight: 700;">Content Approval Required</h2>
    ${contentCard}
    ${requestCard}
    ${actionCard}
  `

  const htmlBody = htmlWrapper(systemContent)

  return { htmlBody, textBody }
}

/**
 * Creates HTML content for a delete sync notification.
 */
export function createDeleteSyncNotificationHtml(
  results: DeleteSyncResult,
  dryRun: boolean,
): { htmlBody: string; textBody: string; title: string } {
  let title: string

  if (results.safetyTriggered) {
    title = '⚠️ Delete Sync Safety Triggered'
  } else if (dryRun) {
    title = '🔍 Delete Sync Simulation Results'
  } else {
    title = '🗑️ Delete Sync Results'
  }

  let textBody = ''

  // Create a summary
  let summaryText = dryRun
    ? 'This was a dry run - no content was actually deleted.'
    : results.safetyTriggered
      ? results.safetyMessage ||
        'A safety check prevented the delete sync operation from running.'
      : "The following content was removed because it's no longer in any user's watchlist."

  if (results.total.protected && results.total.protected > 0) {
    summaryText += ` ${results.total.protected} items were preserved because they are in protected playlists.`
  }

  textBody += `${summaryText}\n\n`

  const titleSection = `
  <p style="margin-bottom: 20px; color: #000000;">${escapeHtml(summaryText)}</p>
  `

  const summarySection = `
  <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: ${results.safetyTriggered ? '#c1666b' : '#212121'}; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
    <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">Summary</h3>
    <div style="display: flex; flex-direction: row; flex-wrap: wrap; justify-content: space-around; margin-top: 15px;">
      <div style="display: flex; align-items: center; margin-right: 20px; margin-bottom: 10px;">
        <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px; display: inline-block; min-width: 30px; text-align: center;">${results.total.processed}</span>
        <span style="font-weight: 500; color: #ffffff; display: inline-block;">Processed</span>
      </div>
      <div style="display: flex; align-items: center; margin-right: 20px; margin-bottom: 10px;">
        <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px; display: inline-block; min-width: 30px; text-align: center;">${results.total.deleted}</span>
        <span style="font-weight: 500; color: #ffffff; display: inline-block;">Deleted</span>
      </div>
      <div style="display: flex; align-items: center; margin-right: 20px; margin-bottom: 10px;">
        <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px; display: inline-block; min-width: 30px; text-align: center;">${results.total.skipped}</span>
        <span style="font-weight: 500; color: #ffffff; display: inline-block;">Skipped</span>
      </div>
      ${
        results.total.protected
          ? `
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px; display: inline-block; min-width: 30px; text-align: center;">${results.total.protected}</span>
        <span style="font-weight: 500; color: #ffffff; display: inline-block;">Protected</span>
      </div>`
          : ''
      }
    </div>
  </div>
  `

  textBody += 'Summary:\n'
  textBody += `Processed: ${results.total.processed} items\n`
  textBody += `Deleted: ${results.total.deleted} items\n`
  textBody += `Skipped: ${results.total.skipped} items\n`
  if (results.total.protected) {
    textBody += `Protected: ${results.total.protected} items\n`
  }
  textBody += '\n'

  // Safety section
  let safetySection = ''
  if (results.safetyTriggered && results.safetyMessage) {
    safetySection = `
    <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">Safety Reason</h3>
      <p style="font-weight: 500; color: #ffffff;">${escapeHtml(results.safetyMessage)}</p>
    </div>
    `
    textBody += `Safety Reason: ${results.safetyMessage}\n\n`
  }

  // Content sections
  let contentSections = ''

  // Movies section
  if (results.movies.deleted > 0) {
    const movieList = results.movies.items
      .slice(0, 10)
      .map(
        (item) =>
          `<li style="margin-bottom: 5px; color: #ffffff; font-weight: 500;">${escapeHtml(item.title)}</li>`,
      )
      .join('')

    const moreMovies =
      results.movies.items.length > 10
        ? `<p style="font-style: italic; margin-top: 10px; color: #ffffff;">... and ${results.movies.items.length - 10} more movies</p>`
        : ''

    const protectedInfo =
      results.movies.protected && results.movies.protected > 0
        ? ` (${results.movies.protected} protected)`
        : ''

    contentSections += `
    <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">Movies (${results.movies.deleted} deleted${protectedInfo})</h3>
      <ul style="margin-bottom: 0; padding-left: 20px; color: #ffffff;">
        ${movieList || '<li style="font-weight: 500; color: #ffffff;">None</li>'}
      </ul>
      ${moreMovies}
    </div>
    `

    const textMovieList = results.movies.items
      .slice(0, 10)
      .map((item) => `• ${item.title}`)
      .join('\n')

    textBody += `Movies (${results.movies.deleted} deleted${protectedInfo}):\n${textMovieList || 'None'}\n`
    if (results.movies.items.length > 10) {
      textBody += `... and ${results.movies.items.length - 10} more movies\n\n`
    } else {
      textBody += '\n'
    }
  } else {
    const protectedInfo =
      results.movies.protected && results.movies.protected > 0
        ? ` (${results.movies.protected} protected)`
        : ''

    contentSections += `
    <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">Movies</h3>
      <p style="font-weight: 500; color: #ffffff;">No movies deleted${protectedInfo}</p>
    </div>
    `
    textBody += `Movies: No movies deleted${protectedInfo}\n\n`
  }

  // TV Shows section
  if (results.shows.deleted > 0) {
    const showList = results.shows.items
      .slice(0, 10)
      .map(
        (item) =>
          `<li style="margin-bottom: 5px; color: #ffffff; font-weight: 500;">${escapeHtml(item.title)}</li>`,
      )
      .join('')

    const moreShows =
      results.shows.items.length > 10
        ? `<p style="font-style: italic; margin-top: 10px; color: #ffffff;">... and ${results.shows.items.length - 10} more TV shows</p>`
        : ''

    const protectedInfo =
      results.shows.protected && results.shows.protected > 0
        ? ` (${results.shows.protected} protected)`
        : ''

    contentSections += `
    <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">TV Shows (${results.shows.deleted} deleted${protectedInfo})</h3>
      <ul style="margin-bottom: 0; padding-left: 20px; color: #ffffff;">
        ${showList || '<li style="font-weight: 500; color: #ffffff;">None</li>'}
      </ul>
      ${moreShows}
    </div>
    `

    const textShowList = results.shows.items
      .slice(0, 10)
      .map((item) => `• ${item.title}`)
      .join('\n')

    textBody += `TV Shows (${results.shows.deleted} deleted${protectedInfo}):\n${textShowList || 'None'}\n`
    if (results.shows.items.length > 10) {
      textBody += `... and ${results.shows.items.length - 10} more TV shows\n\n`
    } else {
      textBody += '\n'
    }
  } else {
    const protectedInfo =
      results.shows.protected && results.shows.protected > 0
        ? ` (${results.shows.protected} protected)`
        : ''

    contentSections += `
    <div style="margin: 15px 0; padding: 15px; border-radius: 5px; background: #212121; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">TV Shows</h3>
      <p style="font-weight: 500; color: #ffffff;">No TV shows deleted${protectedInfo}</p>
    </div>
    `
    textBody += `TV Shows: No TV shows deleted${protectedInfo}\n\n`
  }

  // Timestamp
  const timestamp = new Date().toLocaleString()
  const timestampSection = `
  <div style="text-align: center; margin-top: 15px; font-style: italic; font-weight: 500; color: #ffffff; background-color: #212121; padding: 10px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
    Delete sync operation completed at ${escapeHtml(timestamp)}
  </div>
  `

  textBody += `Delete sync completed at ${timestamp}\n\n- Pulsarr`

  const completeContent = `
    ${titleSection}
    ${summarySection}
    ${safetySection}
    ${contentSections}
    ${timestampSection}
  `

  const htmlBody = htmlWrapper(completeContent)

  return { htmlBody, textBody, title }
}

/**
 * Creates HTML content for a watchlist addition notification.
 */
export function createWatchlistAdditionHtml(item: {
  title: string
  type: string
  addedBy: {
    name: string
    alias?: string | null
  }
  posterUrl?: string
  displayName: string
}): { htmlBody: string; textBody: string; title: string } {
  const mediaTypeRaw = item.type ? item.type.toLowerCase() : ''
  const isMovie = mediaTypeRaw === 'movie'
  const isShow =
    mediaTypeRaw === 'show' ||
    mediaTypeRaw === 'tv' ||
    mediaTypeRaw === 'series'

  const emoji = isMovie ? '🎬' : isShow ? '📺' : '🎬'
  const mediaType = isMovie ? 'Movie' : isShow ? 'Show' : 'Media'

  const title = `${emoji} ${mediaType} Added: ${item.title}`

  const htmlBody = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #000000; border-radius: 5px; background-color: #48a9a6; color: #000000; box-shadow: 4px 4px 0px 0px #000000;">
    <div style="background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      ${
        item.posterUrl
          ? `<div style="text-align: center; margin-bottom: 20px;">
           <img src="${item.posterUrl}" alt="${escapeHtml(item.title)} poster" style="max-width: 200px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
         </div>`
          : ''
      }

      <div>
        <h3 style="margin-top: 0; color: #ffffff; font-weight: 700;">${escapeHtml(item.title)}</h3>
        <p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Type:</strong> ${escapeHtml(mediaType)}</p>
        <p style="font-weight: 500; color: #ffffff;"><strong style="color: #ffffff;">Added by:</strong> ${escapeHtml(item.displayName)}</p>
      </div>
    </div>

    <hr style="border: none; border-top: 1px solid #000000; margin: 20px 0;">
    <p style="color:#000000; font-size:0.9em; text-align: center; font-weight: 500;">Powered by Pulsarr</p>
  </div>
  `

  let textBody = `New ${mediaType} Added\n\n`
  textBody += `${item.title}\n`
  textBody += `Type: ${mediaType}\n`
  textBody += `Added by: ${item.displayName}\n\n`
  textBody += '- Pulsarr'

  return { htmlBody, textBody, title }
}

/**
 * Creates HTML content for a test notification.
 */
export function createTestNotificationHtml(): {
  htmlBody: string
  textBody: string
  title: string
} {
  const testContent = `
    <h2 style="color: #000000; margin-top: 0; font-weight: 700;">Pulsarr HTML Notification Test</h2>

    <div style="background-color: #212121; padding: 15px; margin: 20px 0; border: 2px solid #000000; border-radius: 5px; box-shadow: 4px 4px 0px 0px #000000;">
      <p style="font-weight: 500; color: #ffffff;">This is a test notification to verify your Apprise configuration is working correctly with <strong>HTML formatting</strong>.</p>
    </div>

    <h3 style="color: #000000; font-weight: 700;">HTML Formatting Examples:</h3>

    <div style="margin-bottom: 20px; background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <h4 style="margin-top: 0; margin-bottom: 10px; color: #ffffff; font-weight: 700;">Text Styling</h4>
      <p style="font-weight: 500; color: #ffffff;"><strong>Bold text</strong>, <em>italic text</em>, <u>underlined text</u>, and <span style="color: #ffffff;">colored text</span></p>
    </div>

    <div style="margin-bottom: 20px; background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <h4 style="margin-top: 0; margin-bottom: 10px; color: #ffffff; font-weight: 700;">Lists</h4>
      <ul style="padding-left: 20px; color: #ffffff;">
        <li style="margin-bottom: 5px; font-weight: 500;">Unordered list item 1</li>
        <li style="margin-bottom: 5px; font-weight: 500;">Unordered list item 2</li>
        <li style="margin-bottom: 5px; font-weight: 500;">Unordered list item 3</li>
      </ul>

      <ol style="padding-left: 20px; color: #ffffff;">
        <li style="margin-bottom: 5px; font-weight: 500;">Ordered list item 1</li>
        <li style="margin-bottom: 5px; font-weight: 500;">Ordered list item 2</li>
        <li style="margin-bottom: 5px; font-weight: 500;">Ordered list item 3</li>
      </ol>
    </div>

    <div style="margin-bottom: 20px; background-color: #212121; padding: 15px; border-radius: 5px; border: 2px solid #000000; box-shadow: 4px 4px 0px 0px #000000;">
      <h4 style="margin-top: 0; margin-bottom: 10px; color: #ffffff; font-weight: 700;">Styled Boxes</h4>

      <div style="padding: 10px; background-color: #343746; border-radius: 5px; margin-bottom: 10px; border: 1px solid #ffffff; color: #ffffff; font-weight: 500;">
        <p style="margin: 0;">This is an info box</p>
      </div>

      <div style="padding: 10px; background-color: #343746; border-radius: 5px; margin-bottom: 10px; border: 1px solid #ffffff; color: #ffffff; font-weight: 500;">
        <p style="margin: 0;">This is an alert box</p>
      </div>

      <div style="padding: 10px; background-color: #343746; border-radius: 5px; border: 1px solid #ffffff; color: #ffffff; font-weight: 500;">
        <p style="margin: 0;">This is a success box</p>
      </div>
    </div>

    <p style="font-weight: 500; color: #000000;">If you can see the formatting above, your notification service supports <strong>HTML</strong>! If not, you're seeing the plain text version.</p>
  `

  const htmlBody = htmlWrapper(testContent)

  const textBody =
    'Pulsarr HTML Notification Test\n\n' +
    'This is a test notification to verify your Apprise configuration is working correctly.\n\n' +
    'HTML Formatting Examples:\n\n' +
    '- Text Styling: Bold text, italic text, underlined text, and colored text\n\n' +
    '- Lists:\n' +
    '  • Unordered list item 1\n' +
    '  • Unordered list item 2\n' +
    '  • Unordered list item 3\n\n' +
    '  1. Ordered list item 1\n' +
    '  2. Ordered list item 2\n' +
    '  3. Ordered list item 3\n\n' +
    '- Styled Boxes:\n' +
    '  [Info] This is an info box\n' +
    '  [Alert] This is an alert box\n' +
    '  [Success] This is a success box\n\n' +
    'If you can see the formatting above, your notification service supports basic formatting. If the content appears plain, your service might only support plain text.\n\n' +
    '- Pulsarr'

  return { htmlBody, textBody, title: '🔔 Pulsarr HTML Notification Test' }
}
