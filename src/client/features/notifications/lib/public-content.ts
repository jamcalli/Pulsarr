import { splitUrlList } from '@root/schemas/common/url-list'
import type { StatusPillView } from '@/components/status-pill'
import { formatCount } from '@/lib/format'
import { testApprise, testDiscordWebhook } from '@/lib/notification-tests'
import {
  appriseRowError,
  discordWebhookRowError,
  firstRowError,
} from '@/lib/notification-urls'
import type { components } from '@/types/api.js'

type PublicContent =
  components['schemas']['Config']['publicContentNotifications']
type TestResult = components['schemas']['TestResult']
type SystemTarget = components['schemas']['SystemTestPayload']['target']

export type PublicListName = Exclude<keyof PublicContent, 'enabled'>

export const PUBLIC_CONTENT_TABS = [
  { value: 'all', label: 'All content' },
  { value: 'movies', label: 'Movies' },
  { value: 'shows', label: 'Shows' },
] as const

export type PublicContentTab = (typeof PUBLIC_CONTENT_TABS)[number]['value']

const ALL_TAB_LABEL = PUBLIC_CONTENT_TABS[0].label

export function overrideNote(label: string): string {
  return `${label} without their own list use the ${ALL_TAB_LABEL} lists.`
}

export interface PublicList {
  name: PublicListName
  target: SystemTarget
}

export interface PublicChannel {
  title: string
  listLabel: string
  placeholder: string
  masked: boolean
  validateRow: (url: string) => string | null
  testUrl: (url: string) => Promise<TestResult>
  lists: Record<PublicContentTab, PublicList>
}

export const PUBLIC_CONTENT_OFF_REASON = 'Turn on broadcast to use these lists.'

export const PUBLIC_DISCORD: PublicChannel = {
  title: 'Discord webhooks',
  listLabel: 'Webhook URLs',
  placeholder: 'https://discord.com/api/webhooks/...',
  masked: false,
  validateRow: discordWebhookRowError,
  testUrl: testDiscordWebhook,
  lists: {
    all: { name: 'discordWebhookUrls', target: 'publicDiscord' },
    movies: { name: 'discordWebhookUrlsMovies', target: 'publicDiscordMovies' },
    shows: { name: 'discordWebhookUrlsShows', target: 'publicDiscordShows' },
  },
}

export const PUBLIC_APPRISE: PublicChannel = {
  title: 'Apprise',
  listLabel: 'Apprise URLs',
  placeholder: 'tgram://... or name@example.com',
  masked: true,
  validateRow: appriseRowError,
  testUrl: testApprise,
  lists: {
    all: { name: 'appriseUrls', target: 'publicApprise' },
    movies: { name: 'appriseUrlsMovies', target: 'publicAppriseMovies' },
    shows: { name: 'appriseUrlsShows', target: 'publicAppriseShows' },
  },
}

const PUBLIC_CHANNELS = [PUBLIC_DISCORD, PUBLIC_APPRISE] as const

export function channelUrlCount(
  values: PublicContent,
  channel: PublicChannel,
  tab: PublicContentTab,
): number {
  return splitUrlList(values[channel.lists[tab].name]).length
}

export function savedUrlCount(
  values: PublicContent,
  tab: PublicContentTab,
): number {
  return PUBLIC_CHANNELS.reduce(
    (total, channel) => total + channelUrlCount(values, channel, tab),
    0,
  )
}

export function savedUrlsPill(count: number): StatusPillView {
  return {
    tone: count > 0 ? 'on' : 'off',
    label: `${formatCount(count, 'URL')} saved`,
  }
}

/** The first row error across every unlocked list, prefixed with its tab label when that tab is not active. */
export function publicContentSaveError(
  values: PublicContent,
  activeTab: PublicContentTab,
  locked: readonly PublicChannel[] = [],
): string | null {
  for (const channel of PUBLIC_CHANNELS) {
    if (locked.includes(channel)) continue
    for (const tab of PUBLIC_CONTENT_TABS) {
      const list = channel.lists[tab.value]
      const error = firstRowError(values[list.name], channel.validateRow)
      if (!error) continue
      return tab.value === activeTab ? error : `${tab.label}: ${error}`
    }
  }
  return null
}
