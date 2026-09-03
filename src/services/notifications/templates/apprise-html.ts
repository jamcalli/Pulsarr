import type { DeleteSyncResult } from '@root/types/delete-sync.types.js'
import type {
  MediaNotification,
  SystemNotification,
} from '@root/types/discord.types.js'

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

const BORDER = '2px solid #000000'
const SHADOW = '4px 4px 0px 0px #000000'

const WRAPPER_STYLE = `font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: ${BORDER}; border-radius: 5px; background-color: #48a9a6; color: #000000; box-shadow: ${SHADOW};`
const CARD_STYLE = `margin-bottom: 20px; padding: 15px; border-radius: 5px; border: ${BORDER}; box-shadow: ${SHADOW};`
const CARD_BACKGROUND = '#212121'
const SAFETY_CARD_BACKGROUND = '#c1666b'
const PAGE_HEADING_STYLE = 'color: #000000; margin-top: 0; font-weight: 700;'
const HEADING_STYLE = 'margin-top: 0; color: #ffffff; font-weight: 700;'
const SECTION_HEADING_STYLE = `${HEADING_STYLE} border-bottom: 1px solid #343746; padding-bottom: 5px;`
const LABEL_STYLE = 'color: #ffffff; font-weight: 700; font-size: 14px;'
const VALUE_STYLE = 'color: #ffffff; font-weight: 500;'
const NOTICE_STYLE = 'color: #ffffff; font-weight: 700; text-align: center;'
const LINK_STYLE = 'color: #48a9a6; font-weight: 500; text-decoration: none;'
const DIVIDER_STYLE =
  'margin-top: 15px; padding-top: 15px; border-top: 1px solid #343746;'
const POSTER_STYLE = `border-radius: 5px; border: ${BORDER}; box-shadow: ${SHADOW};`
const CENTER_BLOCK_STYLE = 'text-align: center; margin-bottom: 20px;'

function htmlWrapper(content: string): string {
  return `
    <div style="${WRAPPER_STYLE}">
      ${content}
    </div>
    `
}

function card(inner: string, background = CARD_BACKGROUND): string {
  return `
    <div style="${CARD_STYLE} background-color: ${background};">
      ${inner}
    </div>
  `
}

function pageHeading(text: string): string {
  return `<h2 style="${PAGE_HEADING_STYLE}">${text}</h2>`
}

function heading(text: string): string {
  return `<h3 style="${HEADING_STYLE}">${text}</h3>`
}

function sectionHeading(text: string): string {
  return `<h4 style="${SECTION_HEADING_STYLE}">${text}</h4>`
}

function paragraph(inner: string): string {
  return `<p style="${VALUE_STYLE}">${inner}</p>`
}

function labelledParagraph(label: string, value: string): string {
  return paragraph(
    `<strong style="color: #ffffff;">${label}:</strong> ${value}`,
  )
}

function labelValue(label: string, value: string): string {
  return `
      <div style="margin-bottom: 10px;">
        <div style="${LABEL_STYLE}">${label}</div>
        <div style="${VALUE_STYLE}">${value}</div>
      </div>`
}

function divider(): string {
  return `<div style="${DIVIDER_STYLE}"></div>`
}

function link(url: string, text: string): string {
  return `<a href="${escapeHtml(url)}" style="${LINK_STYLE}">${text}</a>`
}

function centeredLink(url: string, text: string): string {
  return `<div style="${CENTER_BLOCK_STYLE}">${link(url, text)}</div>`
}

function tmdbLink(url: string | undefined): string {
  return url
    ? `<p style="margin-top: 10px;">${link(url, 'View on TMDB')}</p>`
    : ''
}

function createPosterHtml(
  posterUrl: string | undefined,
  title: string,
  maxWidth = 200,
): string {
  if (!posterUrl) return ''
  return `<div style="${CENTER_BLOCK_STYLE}">
       <img src="${posterUrl}" alt="${escapeHtml(title)} poster" style="max-width: ${maxWidth}px; ${POSTER_STYLE}">
     </div>`
}

type DetailLine = { label?: string; value: string }

export function createMediaNotificationHtml(notification: MediaNotification): {
  htmlBody: string
  textBody: string
  title: string
} {
  const emoji = notification.type === 'movie' ? '🎬' : '📺'
  const title = `${emoji} ${notification.title}`

  const details = notification.episodeDetails
  let textHeading: string
  const lines: DetailLine[] = []

  if (notification.type === 'show' && details) {
    if (
      details.seasonNumber !== undefined &&
      details.episodeNumber !== undefined
    ) {
      const seasonNum = details.seasonNumber.toString().padStart(2, '0')
      const episodeNum = details.episodeNumber.toString().padStart(2, '0')
      const episodeTitle = details.title ? ` - "${details.title}"` : ''

      textHeading = 'New Episode Available'
      lines.push({
        label: 'Episode',
        value: `S${seasonNum}E${episodeNum}${episodeTitle}`,
      })
      if (details.overview) {
        lines.push({ label: 'Overview', value: details.overview })
      }
      if (details.airDateUtc) {
        lines.push({
          label: 'Air Date',
          value: new Date(details.airDateUtc).toLocaleDateString(),
        })
      }
    } else if (details.seasonNumber !== undefined) {
      textHeading = 'New Season Available'
      lines.push({
        label: 'Season Added',
        value: `Season ${details.seasonNumber}`,
      })
    } else {
      textHeading = 'New Content Available'
      lines.push({ value: 'New content is now available to watch!' })
    }
  } else {
    textHeading = 'Movie Available'
    lines.push({ value: 'Movie available to watch!' })
  }

  const htmlLines = lines
    .map((line) =>
      line.label
        ? labelledParagraph(line.label, escapeHtml(line.value))
        : paragraph(escapeHtml(line.value)),
    )
    .join('')

  const htmlBody = htmlWrapper(
    createPosterHtml(notification.posterUrl, notification.title) +
      card(
        heading(escapeHtml(notification.title)) +
          htmlLines +
          tmdbLink(notification.tmdbUrl),
      ),
  )

  const textLines = lines
    .map((line) => (line.label ? `${line.label}: ${line.value}` : line.value))
    .join('\n')

  let textBody = `${textHeading}\n\n${notification.title}\n${textLines}`
  if (notification.tmdbUrl) {
    textBody += `\nTMDB: ${notification.tmdbUrl}`
  }

  return { htmlBody, textBody, title }
}

export function createSystemNotificationHtml(
  notification: SystemNotification,
): { htmlBody: string; textBody: string } {
  const fields = Object.fromEntries(
    notification.embedFields.map((field) => [field.name, field.value]),
  )

  const content = fields.Content || 'Unknown Content'
  const pending = escapeHtml(fields['Total pending'] || '0').replace(
    ' requests',
    ' awaiting review',
  )

  const contentCard = card(
    createPosterHtml(
      notification.posterUrl,
      fields.Content || notification.title,
      150,
    ) +
      heading(escapeHtml(content)) +
      labelValue('TYPE', escapeHtml(fields.Type || 'Unknown')),
  )

  const requestCard = card(
    sectionHeading('Request Details') +
      labelValue(
        'REQUESTED BY',
        escapeHtml(fields['Requested by'] || 'Unknown'),
      ) +
      labelValue('PENDING REQUESTS', pending) +
      (fields.Reason
        ? divider() +
          labelValue('REASON FOR APPROVAL', escapeHtml(fields.Reason))
        : ''),
  )

  const actionCard = fields['Action Required']
    ? card(
        `<div style="${NOTICE_STYLE}">${escapeHtml(fields['Action Required'])}</div>`,
      )
    : ''

  const htmlBody = htmlWrapper(
    pageHeading('Content Approval Required') +
      contentCard +
      (notification.tmdbUrl
        ? centeredLink(notification.tmdbUrl, 'View on TMDB')
        : '') +
      requestCard +
      actionCard,
  )

  let textBody = 'Content Approval Required\n\n'
  textBody += `${content}\n`
  textBody += `Type: ${fields.Type || 'Unknown'}\n\n`
  textBody += `Requested by: ${fields['Requested by'] || 'Unknown'}\n`
  textBody += `Total pending: ${fields['Total pending'] || '0'}\n`
  if (fields.Reason) textBody += `Reason: ${fields.Reason}\n`
  if (notification.tmdbUrl) textBody += `TMDB: ${notification.tmdbUrl}\n`
  if (fields['Action Required']) textBody += `\n${fields['Action Required']}\n`

  return { htmlBody, textBody }
}

export function createUpdateAvailableNotificationHtml(release: {
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseName: string | null
  releaseBody: string | null
  releaseBodyHtml: string | null
  publishedAt: string | null
}): { htmlBody: string; textBody: string; title: string } {
  const title = `🚀 Pulsarr ${release.latestVersion} is available`
  const displayName = release.releaseName?.trim() || `v${release.latestVersion}`
  const publishedAt = release.publishedAt
    ? new Date(release.publishedAt).toLocaleDateString()
    : null

  const versionsCard = card(
    heading(escapeHtml(displayName)) +
      labelValue('CURRENT', `v${escapeHtml(release.currentVersion)}`) +
      labelValue('LATEST', `v${escapeHtml(release.latestVersion)}`) +
      (publishedAt
        ? divider() + labelValue('PUBLISHED', escapeHtml(publishedAt))
        : ''),
  )

  // GitHub's /markdown API output is sanitized server-side, so it is injected unescaped
  const notesCard = release.releaseBodyHtml
    ? card(
        sectionHeading('Release Notes') +
          `<div style="margin-top: 15px; ${VALUE_STYLE}">${release.releaseBodyHtml}</div>`,
      )
    : ''

  const htmlBody = htmlWrapper(
    pageHeading('Pulsarr update available') +
      versionsCard +
      centeredLink(release.releaseUrl, 'View release on GitHub') +
      notesCard,
  )

  // Telegram caps a message at 4096 chars, so the text fallback truncates the notes
  const MAX_TEXT_NOTES = 1500
  const notes = release.releaseBody?.trim()
  const truncatedNotes =
    notes && notes.length > MAX_TEXT_NOTES
      ? `${notes.slice(0, MAX_TEXT_NOTES)}...`
      : notes

  let textBody = 'Pulsarr update available\n\n'
  textBody += `${displayName}\n`
  textBody += `Current: v${release.currentVersion}\n`
  textBody += `Latest: v${release.latestVersion}\n`
  if (publishedAt) textBody += `Published: ${publishedAt}\n`
  if (truncatedNotes) textBody += `\nRelease Notes:\n${truncatedNotes}\n`
  textBody += `\nView release: ${release.releaseUrl}\n`

  return { htmlBody, textBody, title }
}

export function createWatchlistCapNotificationHtml(event: {
  userName: string
  contentType: string
  currentCount: number
  cap: number
}): { htmlBody: string; textBody: string } {
  const contentLabel = event.contentType === 'movie' ? 'Movie' : 'Show'
  const impact =
    'New items will not be processed until the cap is raised or items are removed.'

  const detailsCard = card(
    sectionHeading('Cap Details') +
      labelValue('USER', escapeHtml(event.userName)) +
      labelValue('CONTENT TYPE', escapeHtml(contentLabel)) +
      divider() +
      labelValue('USAGE', `${event.currentCount} / ${event.cap}`),
  )

  const htmlBody = htmlWrapper(
    pageHeading('Watchlist Cap Reached') +
      detailsCard +
      card(`<div style="${NOTICE_STYLE}">${impact}</div>`),
  )

  let textBody = 'Watchlist Cap Reached\n\n'
  textBody += `User: ${event.userName}\n`
  textBody += `Content Type: ${contentLabel}\n`
  textBody += `Usage: ${event.currentCount} / ${event.cap}\n\n`
  textBody += `${impact}\n`

  return { htmlBody, textBody }
}

function deletedSection(
  label: string,
  noun: string,
  section: DeleteSyncResult['movies'],
): { html: string; text: string } {
  const protectedInfo =
    section.protected && section.protected > 0
      ? ` (${section.protected} protected)`
      : ''

  if (section.deleted <= 0) {
    return {
      html: card(
        heading(label) + paragraph(`No ${noun} deleted${protectedInfo}`),
      ),
      text: `${label}: No ${noun} deleted${protectedInfo}\n\n`,
    }
  }

  const shown = section.items.slice(0, 10)
  const remaining = section.items.length - shown.length

  const listItems = shown
    .map(
      (item) =>
        `<li style="margin-bottom: 5px; ${VALUE_STYLE}">${escapeHtml(item.title)}</li>`,
    )
    .join('')

  const html = card(
    heading(`${label} (${section.deleted} deleted${protectedInfo})`) +
      `<ul style="margin-bottom: 0; padding-left: 20px; color: #ffffff;">
        ${listItems || `<li style="${VALUE_STYLE}">None</li>`}
      </ul>` +
      (remaining > 0
        ? `<p style="font-style: italic; margin-top: 10px; color: #ffffff;">... and ${remaining} more ${noun}</p>`
        : ''),
  )

  const textList = shown.map((item) => `• ${item.title}`).join('\n')
  let text = `${label} (${section.deleted} deleted${protectedInfo}):\n${textList || 'None'}\n`
  text += remaining > 0 ? `... and ${remaining} more ${noun}\n\n` : '\n'

  return { html, text }
}

function summaryStat(count: number, label: string): string {
  return `<span style="display: inline-block; margin-right: 20px; margin-bottom: 10px;">
        <span style="font-size: 24px; font-weight: 700; color: #ffffff; margin-right: 10px;">${count}</span>
        <span style="${VALUE_STYLE}">${label}</span>
      </span>`
}

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

  let summaryText = dryRun
    ? 'This was a dry run - no content was actually deleted.'
    : results.safetyTriggered
      ? results.safetyMessage ||
        'A safety check prevented the delete sync operation from running.'
      : "The following content was removed because it's no longer in any user's watchlist."

  if (results.total.protected && results.total.protected > 0) {
    summaryText += ` ${results.total.protected} items were preserved because they are in protected playlists.`
  }

  const summaryCard = card(
    heading('Summary') +
      `<div style="margin-top: 15px;">
      ${summaryStat(results.total.processed, 'Processed')}
      ${summaryStat(results.total.deleted, 'Deleted')}
      ${summaryStat(results.total.skipped, 'Skipped')}
      ${results.total.protected ? summaryStat(results.total.protected, 'Protected') : ''}
    </div>`,
    results.safetyTriggered ? SAFETY_CARD_BACKGROUND : CARD_BACKGROUND,
  )

  const safetyCard =
    results.safetyTriggered && results.safetyMessage
      ? card(
          heading('Safety Reason') +
            paragraph(escapeHtml(results.safetyMessage)),
        )
      : ''

  const movies = deletedSection('Movies', 'movies', results.movies)
  const shows = deletedSection('TV Shows', 'TV shows', results.shows)
  const timestamp = new Date().toLocaleString()

  const htmlBody = htmlWrapper(
    `<p style="margin-bottom: 20px; color: #000000;">${escapeHtml(summaryText)}</p>` +
      summaryCard +
      safetyCard +
      movies.html +
      shows.html +
      card(
        `<div style="text-align: center; font-style: italic; ${VALUE_STYLE}">Delete sync operation completed at ${escapeHtml(timestamp)}</div>`,
      ),
  )

  let textBody = `${summaryText}\n\n`
  textBody += 'Summary:\n'
  textBody += `Processed: ${results.total.processed} items\n`
  textBody += `Deleted: ${results.total.deleted} items\n`
  textBody += `Skipped: ${results.total.skipped} items\n`
  if (results.total.protected) {
    textBody += `Protected: ${results.total.protected} items\n`
  }
  textBody += '\n'
  if (results.safetyTriggered && results.safetyMessage) {
    textBody += `Safety Reason: ${results.safetyMessage}\n\n`
  }
  textBody += movies.text
  textBody += shows.text
  textBody += `Delete sync completed at ${timestamp}`

  return { htmlBody, textBody, title }
}

export function createWatchlistAdditionHtml(item: {
  title: string
  type: string
  addedBy: {
    name: string
    alias?: string | null
  }
  posterUrl?: string
  tmdbUrl?: string
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

  const htmlBody = htmlWrapper(
    card(
      createPosterHtml(item.posterUrl, item.title) +
        heading(escapeHtml(item.title)) +
        labelledParagraph('Type', escapeHtml(mediaType)) +
        labelledParagraph('Added by', escapeHtml(item.displayName)) +
        tmdbLink(item.tmdbUrl),
    ),
  )

  let textBody = `New ${mediaType} Added\n\n`
  textBody += `${item.title}\n`
  textBody += `Type: ${mediaType}\n`
  textBody += `Added by: ${item.displayName}`
  if (item.tmdbUrl) {
    textBody += `\nTMDB: ${item.tmdbUrl}`
  }

  return { htmlBody, textBody, title }
}

export function createTestNotificationHtml(): {
  htmlBody: string
  textBody: string
  title: string
} {
  const htmlBody = htmlWrapper(
    pageHeading('Pulsarr HTML Notification Test') +
      card(
        paragraph(
          'This is a test notification to verify your Apprise configuration is working correctly with <strong>HTML formatting</strong>.',
        ),
      ) +
      `<h3 style="color: #000000; font-weight: 700;">HTML Formatting Examples:</h3>` +
      card(
        sectionHeading('Text Styling') +
          paragraph(
            '<strong>Bold text</strong>, <em>italic text</em>, <u>underlined text</u>, and <span style="color: #ffffff;">colored text</span>',
          ),
      ) +
      card(
        sectionHeading('Lists') +
          `<ul style="padding-left: 20px; color: #ffffff;">
        <li style="margin-bottom: 5px; font-weight: 500;">Unordered list item 1</li>
        <li style="margin-bottom: 5px; font-weight: 500;">Unordered list item 2</li>
        <li style="margin-bottom: 5px; font-weight: 500;">Unordered list item 3</li>
      </ul>
      <ol style="padding-left: 20px; color: #ffffff;">
        <li style="margin-bottom: 5px; font-weight: 500;">Ordered list item 1</li>
        <li style="margin-bottom: 5px; font-weight: 500;">Ordered list item 2</li>
        <li style="margin-bottom: 5px; font-weight: 500;">Ordered list item 3</li>
      </ol>`,
      ) +
      card(
        sectionHeading('Styled Boxes') +
          `<div style="padding: 10px; background-color: #343746; border-radius: 5px; border: 1px solid #ffffff; ${VALUE_STYLE}">
        <p style="margin: 0;">This is a styled box</p>
      </div>`,
      ) +
      `<p style="font-weight: 500; color: #000000;">If you can see the formatting above, your notification service supports <strong>HTML</strong>! If not, you're seeing the plain text version.</p>`,
  )

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
    '  [Box] This is a styled box\n\n' +
    'If you can see the formatting above, your notification service supports basic formatting. If the content appears plain, your service might only support plain text.'

  return { htmlBody, textBody, title: '🔔 Pulsarr HTML Notification Test' }
}
