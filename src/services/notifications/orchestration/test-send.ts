import type { Config } from '@root/types/config.types.js'
import type {
  NotificationTestResult,
  SystemTestTarget,
  UserTestChannel,
} from '@root/types/notification.types.js'
import { parseUrls } from '@root/utils/notifications/url-parser.js'
import { timeTest } from '../channels/time-test.js'
import type { NotificationDeps } from '../types.js'

type UrlTest = (url: string) => Promise<NotificationTestResult>

export type TestSendDeps = Pick<
  NotificationDeps,
  'config' | 'db' | 'apprise' | 'discordWebhook' | 'discordBot' | 'plexMobile'
>

export type TestSendOutcome =
  | { status: 'sent'; result: NotificationTestResult }
  | { status: 'not_found' | 'not_configured'; message: string }

interface SystemTargetSetting {
  label: string
  channel: 'apprise' | 'discord-webhook'
  read: (config: Config) => string | undefined
}

const SYSTEM_TARGET_SETTINGS: Record<SystemTestTarget, SystemTargetSetting> = {
  systemApprise: {
    label: 'system Apprise URL',
    channel: 'apprise',
    read: (config) => config.systemAppriseUrl,
  },
  adminWebhook: {
    label: 'admin Discord webhook',
    channel: 'discord-webhook',
    read: (config) => config.discordWebhookUrl,
  },
  publicDiscord: {
    label: 'public Discord webhook',
    channel: 'discord-webhook',
    read: (config) => config.publicContentNotifications?.discordWebhookUrls,
  },
  publicDiscordMovies: {
    label: 'public Discord webhook for movies',
    channel: 'discord-webhook',
    read: (config) =>
      config.publicContentNotifications?.discordWebhookUrlsMovies,
  },
  publicDiscordShows: {
    label: 'public Discord webhook for shows',
    channel: 'discord-webhook',
    read: (config) =>
      config.publicContentNotifications?.discordWebhookUrlsShows,
  },
  publicApprise: {
    label: 'public Apprise URL',
    channel: 'apprise',
    read: (config) => config.publicContentNotifications?.appriseUrls,
  },
  publicAppriseMovies: {
    label: 'public Apprise URL for movies',
    channel: 'apprise',
    read: (config) => config.publicContentNotifications?.appriseUrlsMovies,
  },
  publicAppriseShows: {
    label: 'public Apprise URL for shows',
    channel: 'apprise',
    read: (config) => config.publicContentNotifications?.appriseUrlsShows,
  },
}

async function testEachUrl(
  urls: string[],
  test: UrlTest,
): Promise<NotificationTestResult> {
  if (urls.length === 1) return test(urls[0])

  return timeTest(async () => {
    const results = await Promise.all(
      urls.map(async (url) => ({ url, result: await test(url) })),
    )
    const failed = results.filter(({ result }) => !result.success)
    if (failed.length === 0) return { success: true }

    const reasons = failed
      .map(({ url, result }) => `${url} (${result.error ?? 'no reason given'})`)
      .join(', ')
    return {
      success: false,
      error: `${failed.length} of ${urls.length} URLs failed: ${reasons}`,
    }
  })
}

/** Tests every URL saved in a system setting and folds them into one result. */
export async function testSystemTarget(
  target: SystemTestTarget,
  deps: TestSendDeps,
): Promise<TestSendOutcome> {
  const setting = SYSTEM_TARGET_SETTINGS[target]
  const urls = parseUrls(setting.read(deps.config))
  if (urls.length === 0) {
    return {
      status: 'not_configured',
      message: `No ${setting.label} is saved.`,
    }
  }

  const test: UrlTest =
    setting.channel === 'apprise'
      ? (url) => deps.apprise.testNotification(url)
      : (url) => deps.discordWebhook.testNotification(url)
  return { status: 'sent', result: await testEachUrl(urls, test) }
}

export async function testUserChannel(
  userId: number,
  channel: UserTestChannel,
  deps: TestSendDeps,
): Promise<TestSendOutcome> {
  const user = await deps.db.getUser(userId)
  if (!user) return { status: 'not_found', message: 'User not found.' }

  switch (channel) {
    case 'apprise':
      if (!user.apprise) {
        return {
          status: 'not_configured',
          message: 'This user has no Apprise URL saved.',
        }
      }
      return {
        status: 'sent',
        result: await deps.apprise.testNotification(user.apprise),
      }
    case 'discord-dm':
      if (!user.discord_id) {
        return {
          status: 'not_configured',
          message: 'This user has no Discord ID saved.',
        }
      }
      return {
        status: 'sent',
        result: await deps.discordBot.testNotification(user.discord_id),
      }
    case 'plex-mobile':
      return {
        status: 'sent',
        result: await deps.plexMobile.testNotification(user),
      }
  }
}
