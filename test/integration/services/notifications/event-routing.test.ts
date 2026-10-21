import type { AppriseDetailsResponse } from '@root/types/apprise.types.js'
import { WEBHOOK_EVENT_TYPES } from '@root/types/webhook-endpoint.types.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../../helpers/database.js'
import { createDeferred } from '../../../helpers/deferred.js'
import { seedAll } from '../../../helpers/seeds/index.js'
import { server } from '../../../setup/msw-setup.js'

const APPRISE_BASE = 'http://apprise.test:8000'
// Trimmed from Apprise 2.0.1 /details so the format cache never depends on a reachable server
const APPRISE_DETAILS: AppriseDetailsResponse = {
  schemas: [
    {
      service_name: 'E-Mail',
      protocols: ['mailto'],
      secure_protocols: ['mailtos'],
      details: {
        args: {
          format: {
            name: 'Notify Format',
            type: 'choice:string',
            values: ['text', 'markdown', 'html'],
            default: 'html',
          },
        },
      },
    },
    {
      service_name: 'Telegram',
      secure_protocols: ['tgram'],
      details: {
        args: {
          format: {
            name: 'Notify Format',
            type: 'choice:string',
            values: ['text', 'markdown', 'html'],
            default: 'html',
          },
        },
      },
    },
  ],
}
const SYSTEM_APPRISE = 'tgram://system/chat'
const PUBLIC_APPRISE = 'tgram://public/chat'
const ADMIN_WEBHOOK = 'https://discord.com/api/webhooks/100/admin'
const PUBLIC_WEBHOOK = 'https://discord.com/api/webhooks/200/public'
const CANARY_WEBHOOK = 'https://canary.discord.com/api/webhooks/300/canary'
const NATIVE_WEBHOOK = 'http://hooks.test/pulsarr'
const PLEX_NOTIFICATIONS = 'https://notifications.plex.tv/api/v1/notifications'
const FRIEND_USER_ID = 2
const FRIEND_NAME = 'test-user-discord-apprise'
const FRIEND_DISCORD_ID = '222222222222222222'
const MEDIA_GUID = 'imdb:tt7654321'
const MEDIA_KEY = 'availability-test-key'
const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g
const LOCALE_TIMESTAMP = /\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2}\s[AP]M/g

type Notifications = FastifyInstance['notifications']
type ApprovalBatchRequest = Parameters<Notifications['sendApprovalBatch']>[0][0]
type DmMessage = Parameters<Notifications['discordBot']['sendNotification']>[1]
type CapEvent = Parameters<Notifications['sendWatchlistCapReached']>[0]
type Config = FastifyInstance['config']

type Channel =
  | 'discord-webhook'
  | 'discord-dm'
  | 'apprise'
  | 'plex-mobile'
  | 'native'

interface DiscordWire {
  content?: string
  username?: string
  embeds?: Array<{
    title?: string
    description?: string
    fields?: Array<{ name: string; value: string }>
  }>
}

interface AppriseWire {
  urls: string
  title?: string
  body?: string
  type?: string
  attachment?: string
}

interface RoutingWire {
  instanceId: number
  rootFolder?: string | null
}

interface NativeWire {
  event: string
  timestamp: string
  data: {
    approvalId?: number
    content?: { title: string }
    proposedRouting?: RoutingWire
    additionalRouting?: RoutingWire[]
    watchlistedBy?: Array<{ userId: number }>
  }
}

interface PlexWire {
  to: number[]
}

interface Captured {
  discord: Array<{ url: string; body: DiscordWire }>
  apprise: AppriseWire[]
  native: NativeWire[]
  plex: PlexWire[]
  dms: Array<{ discordId: string; message: DmMessage }>
}

const ALL_ADMIN: Channel[] = ['discord-webhook', 'discord-dm', 'apprise']
const DISCORD_BOTH: Channel[] = ['discord-webhook', 'discord-dm']

const NOTIFY_OPTION_CHANNELS: Record<Config['approvalNotify'], Channel[]> = {
  none: [],
  all: ALL_ADMIN,
  'discord-only': DISCORD_BOTH,
  'apprise-only': ['apprise'],
  'webhook-only': ['discord-webhook'],
  'dm-only': ['discord-dm'],
  'discord-webhook': ['discord-webhook'],
  'discord-message': ['discord-dm'],
  'discord-both': DISCORD_BOTH,
}

const DELETE_SYNC_OPTION_CHANNELS: Record<
  Config['deleteSyncNotify'],
  Channel[]
> = {
  ...NOTIFY_OPTION_CHANNELS,
  message: ['discord-dm'],
  webhook: ['discord-webhook'],
  both: DISCORD_BOTH,
}

const UPDATE_OPTION_CHANNELS: Record<Config['notifyOnUpdate'], Channel[]> = {
  none: [],
  all: ALL_ADMIN,
  'discord-only': DISCORD_BOTH,
  'apprise-only': ['apprise'],
  'webhook-only': ['discord-webhook'],
  'dm-only': ['discord-dm'],
}

function normalize<T>(value: T): T {
  const result: T = JSON.parse(
    JSON.stringify(value)
      .replace(ISO_TIMESTAMP, '<timestamp>')
      .replace(LOCALE_TIMESTAMP, '<local time>')
      .replace(/review_approvals_\d+/g, 'review_approvals_<ms>'),
  )
  return result
}

function approvalRequest(
  overrides: Partial<ApprovalBatchRequest> = {},
): ApprovalBatchRequest {
  return {
    id: 7,
    contentTitle: 'Nosferatu',
    contentType: 'movie',
    contentKey: '5d776c8cad5437001f7c17f0',
    contentGuids: ['imdb:tt5040012', 'tmdb:426063'],
    userId: FRIEND_USER_ID,
    userName: FRIEND_NAME,
    thumb: null,
    proposedRouterDecision: { action: 'require_approval' },
    triggeredBy: 'quota_exceeded',
    approvalReason: 'Weekly movie quota reached',
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function deleteSyncResult(deleted = 1) {
  return {
    total: { deleted, skipped: 1, processed: deleted + 1, protected: 0 },
    movies: {
      deleted,
      skipped: 1,
      protected: 0,
      items: Array.from({ length: deleted }, () => ({
        title: 'Metropolis',
        guid: 'imdb:tt0017136',
        instance: 'Radarr Main',
      })),
    },
    shows: { deleted: 0, skipped: 0, protected: 0, items: [] },
    safetyTriggered: false,
  }
}

const RELEASE = {
  currentVersion: '0.19.7',
  latestVersion: '0.20.0',
  releaseUrl: 'https://github.com/jamcalli/Pulsarr/releases/tag/v0.20.0',
  releaseName: 'v0.20.0',
  releaseBody: 'Bug fixes and improvements',
  releaseBodyHtml: '<p>Bug fixes and improvements</p>',
  publishedAt: '2026-10-01T12:00:00Z',
}

const WATCHLIST_FRIEND = {
  watchlistId: 'watchlist-2',
  username: FRIEND_NAME,
  userId: FRIEND_USER_ID,
}

const WATCHLIST_ITEM = {
  id: 2,
  title: 'Nosferatu',
  type: 'movie',
  thumb:
    'https://metadata-static.plex.tv/b/gracenote/b92a7759185b25342b6a7224406f0c7f.jpg',
  key: '5d776c8cad5437001f7c17f0',
  guids: ['imdb:tt5040012', 'tmdb:426063'],
}

describe('notification event routing', () => {
  let app: FastifyInstance
  let captured: Captured
  let capCount = 10

  beforeAll(async () => {
    app = await build()
    await app.ready()
    await app.notifications.apprise.whenReady()

    app.config.appriseUrl = APPRISE_BASE
    server.use(
      http.get(
        `${APPRISE_BASE}/`,
        () => new HttpResponse(null, { status: 200 }),
      ),
      http.get(`${APPRISE_BASE}/details/`, () =>
        HttpResponse.json(APPRISE_DETAILS),
      ),
    )
    await app.notifications.apprise.initialize()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    await getTestDatabase()('users')
      .where({ id: FRIEND_USER_ID })
      .update({ plex_uuid: 'a1b2c3d4e5f60002' })
    app.config.authenticationMethod = 'disabled'
    app.config.appriseUrl = APPRISE_BASE
    app.config.enableApprise = true
    app.config.systemAppriseUrl = SYSTEM_APPRISE
    app.config.discordWebhookUrl = ADMIN_WEBHOOK
    app.config.publicContentNotifications = { enabled: false }
    app.config.plexTokens = ['test_plex_token_1234567890']
    app.config.plexMobileEnabled = true
    app.config.approvalNotify = 'none'
    app.config.deleteSyncNotify = 'none'
    app.config.deleteSyncNotifyOnlyOnDeletion = false
    app.config.notifyOnUpdate = 'none'
    app.config.watchlistAddNotify = 'none'
    app.config.watchlistCapNotify = 'none'
    app.config.watchlistCapNotifyUser = false
    app.config.notifyOnAvailability = true
    app.plexServerService.setHasPlexPass(true)
    app.plexServerService.setAdminPlexId(1001)
    vi.spyOn(app.plexServerService, 'getServerMachineId').mockReturnValue(
      'machine-1',
    )
    vi.spyOn(app.plexServerService, 'isSSEConnected').mockReturnValue(true)

    await app.db.createWebhookEndpoint({
      name: 'Everything',
      url: NATIVE_WEBHOOK,
      eventTypes: [...WEBHOOK_EVENT_TYPES],
    })

    captured = {
      discord: [],
      apprise: [],
      native: [],
      plex: [],
      dms: captureDiscordDms(),
    }
    server.use(
      http.post(`${APPRISE_BASE}/notify`, async ({ request }) => {
        captured.apprise.push((await request.json()) as AppriseWire)
        return new HttpResponse(null, { status: 200 })
      }),
      http.post(ADMIN_WEBHOOK, async ({ request }) => {
        const body = (await request.json()) as DiscordWire
        captured.discord.push({ url: ADMIN_WEBHOOK, body })
        return new HttpResponse(null, { status: 204 })
      }),
      http.post(PUBLIC_WEBHOOK, async ({ request }) => {
        const body = (await request.json()) as DiscordWire
        captured.discord.push({ url: PUBLIC_WEBHOOK, body })
        return new HttpResponse(null, { status: 204 })
      }),
      http.post(NATIVE_WEBHOOK, async ({ request }) => {
        captured.native.push((await request.json()) as NativeWire)
        return new HttpResponse(null, { status: 200 })
      }),
      http.post(PLEX_NOTIFICATIONS, async ({ request }) => {
        captured.plex.push((await request.json()) as PlexWire)
        return new HttpResponse(null, { status: 200 })
      }),
    )
  })

  afterEach(async () => {
    app.notifications.plexMobile.shutdown()
    await app.notifications.whenIdle()
    vi.restoreAllMocks()
  })

  function captureDiscordDms(): Captured['dms'] {
    const bot = app.notifications.discordBot
    const dms: Captured['dms'] = []
    vi.spyOn(bot, 'getBotStatus').mockReturnValue('running')
    vi.spyOn(bot, 'sendNotification').mockImplementation(
      async (discordId, message) => {
        dms.push({ discordId, message })
        return { ok: true }
      },
    )
    return dms
  }

  function channelsFired(): Channel[] {
    const fired: Array<[Channel, number]> = [
      ['discord-webhook', captured.discord.length],
      ['discord-dm', captured.dms.length],
      ['apprise', captured.apprise.length],
      ['plex-mobile', captured.plex.length],
      ['native', captured.native.length],
    ]
    return fired.filter(([, count]) => count > 0).map(([channel]) => channel)
  }

  async function expectChannels(expected: Channel[]) {
    const sorted = [...expected].sort()
    await vi.waitFor(() => expect([...channelsFired()].sort()).toEqual(sorted))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect([...channelsFired()].sort()).toEqual(sorted)
  }

  function fireCap(event: CapEvent) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      app.notifications.sendWatchlistCapReached(event)
      vi.runOnlyPendingTimers()
    } finally {
      vi.useRealTimers()
    }
  }

  function nextCapEvent(userId = FRIEND_USER_ID): CapEvent {
    capCount += 1
    return {
      userId,
      userName: FRIEND_NAME,
      contentType: 'movie',
      currentCount: capCount,
      cap: 5,
    }
  }

  async function seedAvailabilityItem(userId: number) {
    await getTestDatabase()('watchlist_items').insert({
      user_id: userId,
      title: 'Availability Test Movie',
      key: MEDIA_KEY,
      type: 'movie',
      thumb: 'https://metadata-static.plex.tv/a/availability.jpg',
      guids: JSON.stringify([MEDIA_GUID, 'tmdb:765432']),
      genres: JSON.stringify(['Drama']),
      status: 'grabbed',
    })
  }

  async function setUserFlags(
    userId: number,
    flags: {
      notify_discord?: boolean
      notify_apprise?: boolean
      notify_plex_mobile?: boolean
      notify_discord_mention?: boolean
    },
  ) {
    await getTestDatabase()('users')
      .where({ id: userId })
      .update({
        notify_discord: false,
        notify_apprise: false,
        notify_plex_mobile: false,
        notify_discord_mention: false,
        ...flags,
      })
  }

  function mockPlexLibraryHit() {
    vi.spyOn(app.plexServerService, 'searchByGuid').mockResolvedValue([
      {
        ratingKey: '900',
        key: '/library/metadata/900',
        guid: 'plex://movie/availability',
        type: 'movie',
        title: 'Availability Test Movie',
      },
    ])
  }

  function sendMediaAvailable() {
    return app.notifications.sendMediaAvailable(
      { type: 'movie', guid: MEDIA_GUID, title: 'Availability Test Movie' },
      { isBulkRelease: false, instanceId: 1, instanceType: 'radarr' },
    )
  }

  async function notificationRows(type: string) {
    const rows: Array<{
      user_id: number | null
      sent_to_discord: number
      sent_to_apprise: number
      sent_to_plex_mobile: number | null
      sent_to_native_webhook: number
    }> = await getTestDatabase()('notifications')
      .where({ type })
      .select(
        'user_id',
        'sent_to_discord',
        'sent_to_apprise',
        'sent_to_plex_mobile',
        'sent_to_native_webhook',
      )
      .orderBy('id')
    return rows.map((row) => ({
      userId: row.user_id,
      discord: Boolean(row.sent_to_discord),
      apprise: Boolean(row.sent_to_apprise),
      plexMobile: Boolean(row.sent_to_plex_mobile),
      native: Boolean(row.sent_to_native_webhook),
    }))
  }

  describe('admin event matrix', () => {
    interface MatrixRow {
      name: string
      configure: () => void
      fire: () => Promise<void>
      expected: Channel[]
    }

    const rows: MatrixRow[] = [
      ...Object.entries(NOTIFY_OPTION_CHANNELS).map(
        ([setting, channels]): MatrixRow => ({
          name: `approval.created with approvalNotify ${setting}`,
          configure: () => {
            app.config.approvalNotify = setting as Config['approvalNotify']
          },
          fire: async () => {
            await app.notifications.sendApprovalBatch([approvalRequest()], 3)
          },
          expected: [...channels, 'native'],
        }),
      ),
      ...Object.entries(DELETE_SYNC_OPTION_CHANNELS).map(
        ([setting, channels]): MatrixRow => ({
          name: `delete_sync.completed with deleteSyncNotify ${setting}`,
          configure: () => {
            app.config.deleteSyncNotify = setting as Config['deleteSyncNotify']
          },
          fire: async () => {
            await app.notifications.sendDeleteSyncNotification(
              deleteSyncResult(),
              false,
            )
          },
          expected: [...channels, 'native'],
        }),
      ),
      ...Object.entries(UPDATE_OPTION_CHANNELS).map(
        ([setting, channels]): MatrixRow => ({
          name: `update available with notifyOnUpdate ${setting}`,
          configure: () => {
            app.config.notifyOnUpdate = setting as Config['notifyOnUpdate']
          },
          fire: async () => {
            await app.notifications.sendUpdateAvailableNotification(RELEASE)
          },
          expected: channels,
        }),
      ),
      ...Object.entries(NOTIFY_OPTION_CHANNELS).map(
        ([setting, channels]): MatrixRow => ({
          name: `watchlist.added with watchlistAddNotify ${setting}`,
          configure: () => {
            app.config.watchlistAddNotify =
              setting as Config['watchlistAddNotify']
          },
          fire: async () => {
            await app.notifications.sendWatchlistAdded(
              WATCHLIST_FRIEND,
              WATCHLIST_ITEM,
            )
          },
          expected: [...channels, 'native'],
        }),
      ),
      ...Object.entries(NOTIFY_OPTION_CHANNELS).map(
        ([setting, channels]): MatrixRow => ({
          name: `quota.cap_reached with watchlistCapNotify ${setting}`,
          configure: () => {
            app.config.watchlistCapNotify =
              setting as Config['watchlistCapNotify']
          },
          fire: async () => {
            fireCap(nextCapEvent())
          },
          expected: [...channels, 'native'],
        }),
      ),
    ]

    for (const row of rows) {
      it(`${row.name} fires ${row.expected.join(', ')}`, async () => {
        row.configure()

        await row.fire()

        await expectChannels(row.expected)
      })
    }

    it('skips delete sync admin channels for an empty run when only-on-deletion is on', async () => {
      app.config.deleteSyncNotify = 'all'
      app.config.deleteSyncNotifyOnlyOnDeletion = true

      await app.notifications.sendDeleteSyncNotification(
        deleteSyncResult(0),
        false,
      )

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(channelsFired().filter((c) => c !== 'native')).toEqual([])
    })

    it('delete_sync.completed native webhook fires on an empty run that skips admin channels', async () => {
      app.config.deleteSyncNotify = 'all'
      app.config.deleteSyncNotifyOnlyOnDeletion = true

      await app.notifications.sendDeleteSyncNotification(
        deleteSyncResult(0),
        false,
      )

      await expectChannels(['native'])
    })

    it('skips the watchlist.added fan-out for a user who cannot sync', async () => {
      app.config.watchlistAddNotify = 'all'

      const sent = await app.notifications.sendWatchlistAdded(
        {
          watchlistId: 'watchlist-4',
          username: 'test-user-no-sync',
          userId: 4,
        },
        WATCHLIST_ITEM,
      )

      expect(sent).toBe(false)
      await expectChannels([])
    })

    it('records the watchlist.added fan-out', async () => {
      app.config.watchlistAddNotify = 'all'

      await app.notifications.sendWatchlistAdded(
        WATCHLIST_FRIEND,
        WATCHLIST_ITEM,
      )

      expect(await notificationRows('watchlist_add')).toEqual([
        {
          userId: FRIEND_USER_ID,
          discord: true,
          apprise: true,
          plexMobile: false,
          native: true,
        },
      ])
    })

    it('cap record reflects delivery and is not native with no endpoint subscribed', async () => {
      await getTestDatabase()('webhook_endpoints').delete()

      fireCap(nextCapEvent())

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(await notificationRows('watchlist_cap')).toEqual([])
    })
  })

  describe('watchlist cap', () => {
    it('DMs and Apprises the capped user when watchlistCapNotifyUser is on', async () => {
      app.config.watchlistCapNotifyUser = true

      fireCap(nextCapEvent())

      await expectChannels(['discord-dm', 'apprise', 'native'])
      expect(captured.dms.map((dm) => dm.discordId)).toEqual([
        FRIEND_DISCORD_ID,
      ])
      expect(captured.apprise.map((body) => body.urls)).toEqual([
        'mailto://user2@example.com',
      ])
    })

    it('skips the user channels the capped user has turned off', async () => {
      app.config.watchlistCapNotifyUser = true
      await setUserFlags(FRIEND_USER_ID, {})

      fireCap(nextCapEvent())

      await expectChannels(['native'])
    })

    it('records the capped user delivery when the admin setting is none', async () => {
      app.config.watchlistCapNotifyUser = true
      await setUserFlags(FRIEND_USER_ID, { notify_discord: true })

      fireCap(nextCapEvent())

      await expectChannels(['discord-dm', 'native'])
      expect(await notificationRows('watchlist_cap')).toEqual([
        {
          userId: FRIEND_USER_ID,
          discord: true,
          apprise: false,
          plexMobile: false,
          native: true,
        },
      ])
    })

    it('records one cap row for admin all and the capped user together', async () => {
      app.config.watchlistCapNotify = 'all'
      app.config.watchlistCapNotifyUser = true

      fireCap(nextCapEvent())

      await expectChannels([
        'discord-webhook',
        'discord-dm',
        'apprise',
        'native',
      ])
      expect(captured.dms).toHaveLength(2)
      expect(captured.apprise).toHaveLength(2)
      expect(await notificationRows('watchlist_cap')).toEqual([
        {
          userId: FRIEND_USER_ID,
          discord: true,
          apprise: true,
          plexMobile: false,
          native: true,
        },
      ])
    })

    it('records the union of admin and capped user channels', async () => {
      await getTestDatabase()('webhook_endpoints').delete()
      app.config.watchlistCapNotify = 'apprise-only'
      app.config.watchlistCapNotifyUser = true
      await setUserFlags(FRIEND_USER_ID, { notify_discord: true })

      fireCap(nextCapEvent())

      await expectChannels(['discord-dm', 'apprise'])
      expect(await notificationRows('watchlist_cap')).toEqual([
        {
          userId: FRIEND_USER_ID,
          discord: true,
          apprise: true,
          plexMobile: false,
          native: false,
        },
      ])
    })

    it('debounces a burst into one notification with the latest count', async () => {
      app.config.watchlistCapNotify = 'webhook-only'
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        app.notifications.sendWatchlistCapReached({
          userId: 1,
          userName: 'test-user-primary',
          contentType: 'show',
          currentCount: 6,
          cap: 5,
        })
        app.notifications.sendWatchlistCapReached({
          userId: 1,
          userName: 'test-user-primary',
          contentType: 'show',
          currentCount: 7,
          cap: 5,
        })
        vi.runOnlyPendingTimers()
      } finally {
        vi.useRealTimers()
      }

      await expectChannels(['discord-webhook', 'native'])
      expect(captured.discord).toHaveLength(1)
      expect(captured.discord[0].body.embeds?.[0].description).toBe(
        '**Primary Test User** reached their show cap (7/5)',
      )
    })

    it('suppresses a repeat event at an unchanged count', async () => {
      app.config.watchlistCapNotify = 'webhook-only'
      const event: CapEvent = {
        userId: 4,
        userName: 'test-user-no-sync',
        contentType: 'show',
        currentCount: 6,
        cap: 5,
      }

      fireCap(event)
      await expectChannels(['discord-webhook', 'native'])
      fireCap(event)
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(captured.discord).toHaveLength(1)
      expect(captured.native).toHaveLength(1)
    })

    it('retries a cap notification that delivered nothing and suppresses the repeat after a success', async () => {
      await getTestDatabase()('webhook_endpoints').delete()
      app.config.watchlistCapNotify = 'all'
      const sendDm = vi
        .spyOn(app.notifications.discordBot, 'sendNotification')
        .mockResolvedValue({ ok: false, reason: 'DMs closed' })
      let attempts = 0
      server.use(
        http.post(ADMIN_WEBHOOK, () => {
          attempts += 1
          return new HttpResponse(null, { status: 404 })
        }),
        http.post(
          `${APPRISE_BASE}/notify`,
          () => new HttpResponse(null, { status: 404 }),
        ),
      )
      const event = nextCapEvent()

      fireCap(event)
      await app.notifications.whenIdle()
      fireCap(event)
      await app.notifications.whenIdle()

      expect(attempts).toBe(2)
      expect(await notificationRows('watchlist_cap')).toEqual([])

      sendDm.mockResolvedValue({ ok: true })
      fireCap(event)
      await app.notifications.whenIdle()
      fireCap(event)
      await app.notifications.whenIdle()

      expect(attempts).toBe(3)
      expect(sendDm).toHaveBeenCalledTimes(3)
    })

    it('cap re-notifies a user who dropped to the cap and went over again at the same count', async () => {
      app.config.watchlistCapNotify = 'webhook-only'
      const event: CapEvent = {
        userId: 4,
        userName: 'test-user-no-sync',
        contentType: 'movie',
        currentCount: 6,
        cap: 5,
      }

      fireCap(event)
      await vi.waitFor(() => expect(captured.discord).toHaveLength(1))
      app.notifications.clearWatchlistCap(event.userId, event.contentType)
      fireCap(event)

      await vi.waitFor(() => expect(captured.discord).toHaveLength(2))
    })
  })

  describe('media available user channels', () => {
    interface UserChannelRow {
      name: string
      flags: Parameters<typeof setUserFlags>[1]
      expected: Channel[]
    }

    const rows: UserChannelRow[] = [
      {
        name: 'notify_discord DMs the watchlister',
        flags: { notify_discord: true },
        expected: ['discord-dm', 'native'],
      },
      {
        name: 'notify_apprise sends to the watchlister Apprise URL',
        flags: { notify_apprise: true },
        expected: ['apprise', 'native'],
      },
      {
        name: 'notify_plex_mobile pushes to the watchlister',
        flags: { notify_plex_mobile: true },
        expected: ['plex-mobile', 'native'],
      },
      {
        name: 'every flag on fans out to every user channel',
        flags: {
          notify_discord: true,
          notify_apprise: true,
          notify_plex_mobile: true,
        },
        expected: ['discord-dm', 'apprise', 'plex-mobile', 'native'],
      },
      {
        name: 'media.available native webhook fires when the only watchlister has every channel off',
        flags: {},
        expected: ['native'],
      },
    ]

    for (const row of rows) {
      it(row.name, async () => {
        await seedAvailabilityItem(FRIEND_USER_ID)
        await setUserFlags(FRIEND_USER_ID, row.flags)
        mockPlexLibraryHit()

        await sendMediaAvailable()

        await expectChannels(row.expected)
      })
    }

    it('records one row per notified watchlister with its channel flags', async () => {
      await seedAvailabilityItem(FRIEND_USER_ID)
      mockPlexLibraryHit()

      await sendMediaAvailable()

      await vi.waitFor(async () =>
        expect(await notificationRows('movie')).toEqual([
          {
            userId: FRIEND_USER_ID,
            discord: true,
            apprise: true,
            plexMobile: false,
            native: true,
          },
        ]),
      )
    })

    it('skips per-user channels when notifyOnAvailability is off', async () => {
      app.config.notifyOnAvailability = false
      await seedAvailabilityItem(FRIEND_USER_ID)

      await sendMediaAvailable()

      expect(channelsFired().filter((c) => c !== 'native')).toEqual([])
    })

    it('media.available native webhook fires when notifyOnAvailability and public are off', async () => {
      app.config.notifyOnAvailability = false
      await seedAvailabilityItem(FRIEND_USER_ID)

      await sendMediaAvailable()

      await expectChannels(['native'])
    })

    it('media.available native webhook fires when every row is a duplicate', async () => {
      await seedAvailabilityItem(FRIEND_USER_ID)
      await sendMediaAvailable()
      await expectChannels(['discord-dm', 'apprise', 'native'])
      captured.native.length = 0

      await sendMediaAvailable()

      await vi.waitFor(() => expect(captured.native).toHaveLength(1))
    })

    it('releases a watchlister claim whose DM and Apprise both failed so the next event retries', async () => {
      await seedAvailabilityItem(FRIEND_USER_ID)
      await setUserFlags(FRIEND_USER_ID, {
        notify_discord: true,
        notify_apprise: true,
      })
      const sendDm = vi
        .spyOn(app.notifications.discordBot, 'sendNotification')
        .mockResolvedValue({ ok: false, reason: 'DMs closed' })
      let appriseAttempts = 0
      server.use(
        http.post(`${APPRISE_BASE}/notify`, () => {
          appriseAttempts += 1
          return new HttpResponse(null, { status: 404 })
        }),
      )

      await sendMediaAvailable()
      await app.notifications.whenIdle()
      expect(await notificationRows('movie')).toEqual([])

      await sendMediaAvailable()
      await app.notifications.whenIdle()

      expect(sendDm).toHaveBeenCalledTimes(2)
      expect(appriseAttempts).toBe(2)
    })

    it('keeps a watchlister claim with one delivered channel and suppresses the repeat', async () => {
      await seedAvailabilityItem(FRIEND_USER_ID)
      await setUserFlags(FRIEND_USER_ID, {
        notify_discord: true,
        notify_apprise: true,
      })
      server.use(
        http.post(
          `${APPRISE_BASE}/notify`,
          () => new HttpResponse(null, { status: 404 }),
        ),
      )

      await sendMediaAvailable()
      await app.notifications.whenIdle()
      await sendMediaAvailable()
      await app.notifications.whenIdle()

      expect(captured.dms).toHaveLength(1)
      expect(await notificationRows('movie')).toEqual([
        {
          userId: FRIEND_USER_ID,
          discord: true,
          apprise: false,
          plexMobile: false,
          native: true,
        },
      ])
    })

    it('media.available watchlistedBy lists every watchlister', async () => {
      await seedAvailabilityItem(FRIEND_USER_ID)
      await seedAvailabilityItem(4)

      await sendMediaAvailable()

      await vi.waitFor(() => expect(captured.native).toHaveLength(1))
      expect(
        captured.native[0].data.watchlistedBy?.map((user) => user.userId),
      ).toEqual([FRIEND_USER_ID, 4])
    })

    it('sends public Discord with opted-in mentions and public Apprise', async () => {
      app.config.publicContentNotifications = {
        enabled: true,
        discordWebhookUrls: PUBLIC_WEBHOOK,
        appriseUrls: PUBLIC_APPRISE,
      }
      await seedAvailabilityItem(FRIEND_USER_ID)
      await setUserFlags(FRIEND_USER_ID, { notify_discord_mention: true })

      await sendMediaAvailable()

      await expectChannels(['discord-webhook', 'apprise', 'native'])
      expect(captured.discord.map((post) => post.url)).toEqual([PUBLIC_WEBHOOK])
      expect(captured.discord[0].body.content).toBe(
        `<@${FRIEND_DISCORD_ID}> Movie available: Availability Test Movie`,
      )
      expect(captured.apprise.map((body) => body.urls)).toEqual([
        PUBLIC_APPRISE,
      ])
      expect(await notificationRows('movie')).toEqual([
        {
          userId: FRIEND_USER_ID,
          discord: true,
          apprise: false,
          plexMobile: false,
          native: true,
        },
        {
          userId: null,
          discord: true,
          apprise: true,
          plexMobile: false,
          native: true,
        },
      ])
    })

    it('records a mention-only watchlister only once the public post mentioning them is delivered', async () => {
      app.config.publicContentNotifications = {
        enabled: true,
        discordWebhookUrls: PUBLIC_WEBHOOK,
      }
      await seedAvailabilityItem(FRIEND_USER_ID)
      await setUserFlags(FRIEND_USER_ID, { notify_discord_mention: true })
      server.use(
        http.post(
          PUBLIC_WEBHOOK,
          () => new HttpResponse(null, { status: 404 }),
          { once: true },
        ),
      )

      await sendMediaAvailable()
      await app.notifications.whenIdle()

      expect(await notificationRows('movie')).toEqual([])

      await sendMediaAvailable()
      await app.notifications.whenIdle()

      expect(captured.discord[0].body.content).toBe(
        `<@${FRIEND_DISCORD_ID}> Movie available: Availability Test Movie`,
      )
      expect(await notificationRows('movie')).toEqual([
        {
          userId: FRIEND_USER_ID,
          discord: true,
          apprise: false,
          plexMobile: false,
          native: true,
        },
        {
          userId: null,
          discord: true,
          apprise: false,
          plexMobile: false,
          native: true,
        },
      ])
    })
  })

  describe('native-only events', () => {
    function approval() {
      const request: Parameters<Notifications['sendApprovalResolved']>[0] = {
        id: 11,
        userId: FRIEND_USER_ID,
        userName: FRIEND_NAME,
        contentType: 'movie',
        contentTitle: 'Nosferatu',
        contentKey: '5d776c8cad5437001f7c17f0',
        contentGuids: ['imdb:tt5040012', 'tmdb:426063'],
        thumb: null,
        proposedRouterDecision: {
          action: 'require_approval',
          approval: {
            reason: 'Weekly movie quota reached',
            triggeredBy: 'quota_exceeded',
            data: {},
            proposedRouting: {
              instanceId: 1,
              instanceType: 'radarr',
              qualityProfile: 1,
              rootFolder: '/movies',
              tags: ['pulsarr'],
              priority: 50,
              searchOnAdd: true,
              minimumAvailability: 'released',
              monitor: 'movieOnly',
            },
          },
        },
        triggeredBy: 'quota_exceeded',
        approvalReason: 'Weekly movie quota reached',
        status: 'approved',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T11:00:00.000Z',
      }
      return request
    }

    const events: Array<{
      name: string
      type: string
      fire: () => Promise<boolean>
    }> = [
      {
        name: 'approval.resolved',
        type: 'approval_resolved',
        fire: () =>
          app.notifications.sendApprovalResolved(
            approval(),
            'approved',
            1,
            'Looks good',
          ),
      },
      {
        name: 'approval.auto',
        type: 'approval_auto',
        fire: () =>
          app.notifications.sendApprovalAuto(
            approval(),
            {
              instanceType: 'radarr',
              instanceId: 1,
              qualityProfile: 1,
              rootFolder: '/movies',
              tags: [],
              priority: 50,
            },
            'Quota bypass rule',
          ),
      },
      {
        name: 'watchlist.removed',
        type: 'watchlist_removed',
        fire: () =>
          app.notifications.sendWatchlistRemoved(FRIEND_USER_ID, FRIEND_NAME, {
            id: 2,
            title: 'Nosferatu',
            key: '5d776c8cad5437001f7c17f0',
            type: 'movie',
            guids: '["imdb:tt5040012","tmdb:426063"]',
            user_id: FRIEND_USER_ID,
            status: 'pending',
            created_at: '2026-10-01T10:00:00.000Z',
            updated_at: '2026-10-01T10:00:00.000Z',
          }),
      },
      {
        name: 'user.created',
        type: 'user_created',
        fire: async () => {
          const user = await app.db.getUser(FRIEND_USER_ID)
          if (!user) throw new Error('seed user missing')
          return app.notifications.sendUserCreated(user)
        },
      },
    ]

    for (const event of events) {
      it(`${event.name} fires only the native webhook and records it`, async () => {
        app.config.approvalNotify = 'all'
        app.config.watchlistAddNotify = 'all'

        expect(await event.fire()).toBe(true)

        await expectChannels(['native'])
        expect(captured.native[0].event).toBe(event.name)
        expect(await notificationRows(event.type)).toEqual([
          {
            userId: FRIEND_USER_ID,
            discord: false,
            apprise: false,
            plexMobile: false,
            native: true,
          },
        ])
      })

      it(`${event.name} sends and records nothing with no endpoint subscribed`, async () => {
        await getTestDatabase()('webhook_endpoints').delete()

        expect(await event.fire()).toBe(false)

        await expectChannels([])
        expect(await notificationRows(event.type)).toEqual([])
      })
    }

    it('approval.resolved leaves routing out of a rejection', async () => {
      await app.notifications.sendApprovalResolved(approval(), 'denied', 1)

      await expectChannels(['native'])
      expect(normalize(captured.native)).toMatchInlineSnapshot(`
        [
          {
            "data": {
              "approvalId": 11,
              "content": {
                "guids": [
                  "imdb:tt5040012",
                  "tmdb:426063",
                ],
                "key": "5d776c8cad5437001f7c17f0",
                "title": "Nosferatu",
                "type": "movie",
              },
              "createdAt": "<timestamp>",
              "requestedBy": {
                "alias": "Discord+Apprise User",
                "userId": 2,
                "username": "test-user-discord-apprise",
              },
              "resolvedAt": "<timestamp>",
              "resolvedBy": {
                "userId": 1,
              },
              "status": "rejected",
              "triggeredBy": "quota_exceeded",
            },
            "event": "approval.resolved",
            "timestamp": "<timestamp>",
          },
        ]
      `)
    })

    it('wire bodies', async () => {
      for (const event of events) {
        await event.fire()
      }

      await vi.waitFor(() => expect(captured.native).toHaveLength(4))
      expect(normalize(captured.native)).toMatchInlineSnapshot(`
        [
          {
            "data": {
              "approvalId": 11,
              "approvalNotes": "Looks good",
              "content": {
                "guids": [
                  "imdb:tt5040012",
                  "tmdb:426063",
                ],
                "key": "5d776c8cad5437001f7c17f0",
                "title": "Nosferatu",
                "type": "movie",
              },
              "createdAt": "<timestamp>",
              "requestedBy": {
                "alias": "Discord+Apprise User",
                "userId": 2,
                "username": "test-user-discord-apprise",
              },
              "resolvedAt": "<timestamp>",
              "resolvedBy": {
                "userId": 1,
              },
              "routing": {
                "instanceId": 1,
                "instanceType": "radarr",
                "minimumAvailability": "released",
                "monitor": "movieOnly",
                "qualityProfile": 1,
                "rootFolder": "/movies",
                "searchOnAdd": true,
                "tags": [
                  "pulsarr",
                ],
              },
              "status": "approved",
              "triggeredBy": "quota_exceeded",
            },
            "event": "approval.resolved",
            "timestamp": "<timestamp>",
          },
          {
            "data": {
              "approvalId": 11,
              "content": {
                "guids": [
                  "imdb:tt5040012",
                  "tmdb:426063",
                ],
                "key": "5d776c8cad5437001f7c17f0",
                "title": "Nosferatu",
                "type": "movie",
              },
              "reason": "Quota bypass rule",
              "routing": {
                "instanceId": 1,
                "instanceType": "radarr",
                "minimumAvailability": null,
                "monitor": null,
                "qualityProfile": 1,
                "rootFolder": "/movies",
                "searchOnAdd": null,
                "tags": [],
              },
              "user": {
                "alias": "Discord+Apprise User",
                "userId": 2,
                "username": "test-user-discord-apprise",
              },
            },
            "event": "approval.auto",
            "timestamp": "<timestamp>",
          },
          {
            "data": {
              "content": {
                "guids": [
                  "imdb:tt5040012",
                  "tmdb:426063",
                ],
                "key": "5d776c8cad5437001f7c17f0",
                "title": "Nosferatu",
                "type": "movie",
              },
              "removedBy": {
                "alias": "Discord+Apprise User",
                "userId": 2,
                "username": "test-user-discord-apprise",
              },
              "watchlistItemId": 2,
            },
            "event": "watchlist.removed",
            "timestamp": "<timestamp>",
          },
          {
            "data": {
              "canSync": true,
              "createdAt": "<timestamp>",
              "requiresApproval": false,
              "user": {
                "alias": "Discord+Apprise User",
                "id": 2,
                "name": "test-user-discord-apprise",
              },
            },
            "event": "user.created",
            "timestamp": "<timestamp>",
          },
        ]
      `)
    })
  })

  describe('wire bodies', () => {
    it('approval.created', async () => {
      app.config.approvalNotify = 'all'

      await app.notifications.sendApprovalBatch(
        [
          approvalRequest(),
          approvalRequest({
            id: 8,
            contentTitle: 'Sherlock',
            contentType: 'show',
            contentKey: 'sherlock-key',
            contentGuids: ['tvdb:176941'],
            triggeredBy: 'manual_flag',
            approvalReason: null,
          }),
        ],
        4,
      )

      await vi.waitFor(() => expect(captured.native).toHaveLength(2))
      captured.native.sort(
        (a, b) => (a.data.approvalId ?? 0) - (b.data.approvalId ?? 0),
      )
      expect(normalize(captured)).toMatchInlineSnapshot(`
        {
          "apprise": [
            {
              "attachment": "https://metadata-static.plex.tv/b/gracenote/b92a7759185b25342b6a7224406f0c7f.jpg",
              "body": "Approval request

        Nosferatu
        Type: Movie

        Requested by: Discord+Apprise User
        Total pending: 4 requests
        Reason: Quota exceeded
        Weekly movie quota reached
        TMDB: https://www.themoviedb.org/movie/426063

        Visit the Pulsarr UI to review and handle this approval request.
        ",
              "format": "text",
              "title": "Approval request: Nosferatu",
              "type": "info",
              "urls": "tgram://system/chat",
            },
            {
              "body": "Approval request

        Sherlock
        Type: Show

        Requested by: Discord+Apprise User
        Total pending: 4 requests
        Reason: Manual flag

        Visit the Pulsarr UI to review and handle this approval request.
        ",
              "format": "text",
              "title": "Approval request: Sherlock",
              "type": "info",
              "urls": "tgram://system/chat",
            },
          ],
          "discord": [
            {
              "body": {
                "avatar_url": "https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png",
                "embeds": [
                  {
                    "color": 16749824,
                    "description": "**Nosferatu** (Movie)",
                    "fields": [
                      {
                        "inline": true,
                        "name": "Requested by",
                        "value": "Discord+Apprise User",
                      },
                      {
                        "inline": true,
                        "name": "Pending requests",
                        "value": "4 awaiting review",
                      },
                      {
                        "inline": false,
                        "name": "Reason for approval",
                        "value": "Quota exceeded
        Weekly movie quota reached",
                      },
                      {
                        "inline": true,
                        "name": "More Info",
                        "value": "[View on TMDB](https://www.themoviedb.org/movie/426063)",
                      },
                    ],
                    "footer": {
                      "text": "Request ID: 7",
                    },
                    "image": {
                      "url": "https://metadata-static.plex.tv/b/gracenote/b92a7759185b25342b6a7224406f0c7f.jpg",
                    },
                    "timestamp": "<timestamp>",
                    "title": "Approval request: Nosferatu",
                  },
                ],
                "username": "Pulsarr Approvals",
              },
              "url": "https://discord.com/api/webhooks/100/admin",
            },
            {
              "body": {
                "avatar_url": "https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png",
                "embeds": [
                  {
                    "color": 16749824,
                    "description": "**Sherlock** (Show)",
                    "fields": [
                      {
                        "inline": true,
                        "name": "Requested by",
                        "value": "Discord+Apprise User",
                      },
                      {
                        "inline": true,
                        "name": "Pending requests",
                        "value": "4 awaiting review",
                      },
                      {
                        "inline": false,
                        "name": "Reason for approval",
                        "value": "Manual flag",
                      },
                    ],
                    "footer": {
                      "text": "Request ID: 8",
                    },
                    "timestamp": "<timestamp>",
                    "title": "Approval request: Sherlock",
                  },
                ],
                "username": "Pulsarr Approvals",
              },
              "url": "https://discord.com/api/webhooks/100/admin",
            },
          ],
          "dms": [
            {
              "discordId": "111111111111111111",
              "message": {
                "components": [
                  {
                    "components": [
                      {
                        "custom_id": "review_approvals_<ms>",
                        "label": "Review Approvals",
                        "style": 1,
                        "type": 2,
                      },
                    ],
                    "type": 1,
                  },
                ],
                "embed": {
                  "color": 65280,
                  "description": "System notification",
                  "fields": [
                    {
                      "inline": false,
                      "name": "Pending Approvals",
                      "value": "4 awaiting review",
                    },
                    {
                      "inline": false,
                      "name": "​",
                      "value": "​",
                    },
                    {
                      "inline": false,
                      "name": "New Requests",
                      "value": "1 movie and 1 show added to queue",
                    },
                    {
                      "inline": false,
                      "name": "Recent Requests",
                      "value": "• Nosferatu
        • Sherlock",
                    },
                  ],
                  "timestamp": "<timestamp>",
                  "title": "Approval requests: 2 new",
                },
              },
            },
          ],
          "native": [
            {
              "data": {
                "approvalId": 7,
                "approvalReason": "Weekly movie quota reached",
                "content": {
                  "guids": [
                    "imdb:tt5040012",
                    "tmdb:426063",
                  ],
                  "key": "5d776c8cad5437001f7c17f0",
                  "posterUrl": "https://metadata-static.plex.tv/b/gracenote/b92a7759185b25342b6a7224406f0c7f.jpg",
                  "title": "Nosferatu",
                  "type": "movie",
                },
                "pendingCount": 4,
                "requestedBy": {
                  "alias": "Discord+Apprise User",
                  "userId": 2,
                  "username": "test-user-discord-apprise",
                },
                "triggeredBy": "quota_exceeded",
              },
              "event": "approval.created",
              "timestamp": "<timestamp>",
            },
            {
              "data": {
                "approvalId": 8,
                "approvalReason": null,
                "content": {
                  "guids": [
                    "tvdb:176941",
                  ],
                  "key": "sherlock-key",
                  "title": "Sherlock",
                  "type": "show",
                },
                "pendingCount": 4,
                "requestedBy": {
                  "alias": "Discord+Apprise User",
                  "userId": 2,
                  "username": "test-user-discord-apprise",
                },
                "triggeredBy": "manual_flag",
              },
              "event": "approval.created",
              "timestamp": "<timestamp>",
            },
          ],
          "plex": [],
        }
      `)
    })

    it('media.available', async () => {
      app.config.publicContentNotifications = {
        enabled: true,
        discordWebhookUrls: PUBLIC_WEBHOOK,
        appriseUrls: PUBLIC_APPRISE,
      }
      await seedAvailabilityItem(FRIEND_USER_ID)
      await setUserFlags(FRIEND_USER_ID, {
        notify_discord: true,
        notify_apprise: true,
        notify_plex_mobile: true,
        notify_discord_mention: true,
      })
      mockPlexLibraryHit()

      await app.notifications.sendMediaAvailable(
        { type: 'movie', guid: MEDIA_GUID, title: 'Availability Test Movie' },
        {
          isBulkRelease: false,
          instanceId: 1,
          instanceType: 'radarr',
          sequential: true,
        },
      )

      await vi.waitFor(() => expect(captured.native).toHaveLength(1))
      expect(normalize(captured)).toMatchInlineSnapshot(`
        {
          "apprise": [
            {
              "body": "<div style="margin:0;padding:32px 16px;background:#f2ebdd;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;color:#1a1a1a;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="width:100%;max-width:600px;margin:0 auto;table-layout:fixed;border-collapse:separate;border:2px solid #1a1a1a;border-radius:8px;background:#fffaf0;box-shadow:4px 4px 0 0 #1a1a1a;">
            <tr><td style="padding:10px 24px;background:#48a9a6;border-bottom:2px solid #1a1a1a;border-radius:6px 6px 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;"><tr>
                <td width="50%" style="width:50%;white-space:nowrap;font-size:15px;font-weight:700;color:#000000;letter-spacing:-0.01em;">Pulsarr</td>
                <td align="right" width="50%" style="width:50%;padding-left:16px;text-align:right;font-size:13px;font-weight:500;color:#000000;">Movie available</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:24px;font-size:14px;line-height:1.5;color:#1a1a1a;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;table-layout:fixed;"><tr><td width="120" valign="top" style="width:120px;vertical-align:top;padding-right:20px;"><img src="https://metadata-static.plex.tv/a/availability.jpg" alt="Availability Test Movie poster" width="120" height="180" style="display:block;width:120px;height:180px;border:2px solid #1a1a1a;border-radius:6px;background:#f7f0e2;font-size:12px;color:#5a5750;"></td><td valign="top" style="vertical-align:top;word-break:break-word;"><h1 style="margin:0;font-size:22px;line-height:1.25;font-weight:700;color:#1a1a1a;word-break:break-word;">Availability Test Movie</h1></td></tr></table><div style="margin-top:12px;"><p style="margin:0;font-size:14px;font-weight:700;color:#1a1a1a;">Movie available to watch!</p></div><div style="margin-top:12px;"><div style="padding-top:4px;text-align:left;"><a href="https://www.themoviedb.org/movie/765432" style="font-size:14px;font-weight:700;color:#1a1a1a;text-decoration:underline;text-underline-offset:3px;">View on TMDB</a></div></div></td></tr>
          </table>
        </div>",
              "format": "html",
              "title": "Movie available: Availability Test Movie",
              "type": "info",
              "urls": "mailto://user2@example.com",
            },
            {
              "attachment": "https://metadata-static.plex.tv/a/availability.jpg",
              "body": "Movie available

        Availability Test Movie
        Movie available to watch!
        TMDB: https://www.themoviedb.org/movie/765432",
              "format": "text",
              "title": "Movie available: Availability Test Movie",
              "type": "info",
              "urls": "tgram://public/chat",
            },
          ],
          "discord": [
            {
              "body": {
                "allowed_mentions": {
                  "users": [
                    "222222222222222222",
                  ],
                },
                "avatar_url": "https://raw.githubusercontent.com/jamcalli/Pulsarr/master/src/client/assets/images/pulsarr.png",
                "content": "<@222222222222222222> Movie available: Availability Test Movie",
                "embeds": [
                  {
                    "color": 4762022,
                    "fields": [
                      {
                        "inline": true,
                        "name": "More Info",
                        "value": "[View on TMDB](https://www.themoviedb.org/movie/765432)",
                      },
                    ],
                    "image": {
                      "url": "https://metadata-static.plex.tv/a/availability.jpg",
                    },
                    "timestamp": "<timestamp>",
                    "title": "Movie available: Availability Test Movie",
                  },
                ],
                "username": "Pulsarr",
              },
              "url": "https://discord.com/api/webhooks/200/public",
            },
          ],
          "dms": [
            {
              "discordId": "222222222222222222",
              "message": {
                "embed": {
                  "color": 4762022,
                  "fields": [
                    {
                      "inline": true,
                      "name": "More Info",
                      "value": "[View on TMDB](https://www.themoviedb.org/movie/765432)",
                    },
                  ],
                  "image": {
                    "url": "https://metadata-static.plex.tv/a/availability.jpg",
                  },
                  "timestamp": "<timestamp>",
                  "title": "Movie available: Availability Test Movie",
                },
              },
            },
          ],
          "native": [
            {
              "data": {
                "guids": [
                  "imdb:tt7654321",
                  "tmdb:765432",
                ],
                "instanceId": 1,
                "instanceType": "radarr",
                "isBulkRelease": false,
                "key": "availability-test-key",
                "mediaType": "movie",
                "posterUrl": "https://metadata-static.plex.tv/a/availability.jpg",
                "title": "Availability Test Movie",
                "watchlistedBy": [
                  {
                    "alias": "Discord+Apprise User",
                    "userId": 2,
                    "username": "test-user-discord-apprise",
                  },
                ],
              },
              "event": "media.available",
              "timestamp": "<timestamp>",
            },
          ],
          "plex": [
            {
              "data": {
                "provider": {
                  "identifier": "machine-1",
                  "title": "Plex",
                },
              },
              "group": "media",
              "identifier": "tv.plex.notification.library.new",
              "metadata": {
                "title": "Availability Test Movie",
                "type": "movie",
              },
              "play": false,
              "to": [
                2,
              ],
              "uri": "server://machine-1/com.plexapp.plugins.library/library/metadata/900",
            },
          ],
        }
      `)
    })
  })

  describe('approval service batching', () => {
    const ROUTING = {
      instanceId: 1,
      instanceType: 'radarr' as const,
      qualityProfile: 1,
      rootFolder: '/movies',
      tags: ['pulsarr'],
      priority: 50,
      searchOnAdd: true,
      minimumAvailability: 'released' as const,
      monitor: 'movieOnly' as const,
      syncedInstances: [],
    }

    function createApproval(title: string, key: string) {
      return app.approvalService.createApprovalRequest(
        { id: FRIEND_USER_ID, name: FRIEND_NAME },
        { title, type: 'movie', guids: [`imdb:${key}`] },
        {
          action: 'require_approval',
          approval: {
            reason: 'Matched two router rules',
            triggeredBy: 'router_rule',
            data: { ruleId: 1 },
            proposedRouting: ROUTING,
            additionalRouting: [
              { ...ROUTING, rootFolder: '/movies-4k', priority: 40 },
            ],
          },
        },
        'router_rule',
        'Matched two router rules',
        undefined,
        key,
      )
    }

    it('batches a created request into one admin fan-out', async () => {
      app.config.approvalNotify = 'webhook-only'

      await createApproval('Metropolis', 'metropolis-key')
      await app.approvalService.flushPendingNotifications()

      await expectChannels(['discord-webhook', 'native'])
      expect(captured.native[0].data.content?.title).toBe('Metropolis')
    })

    it('approval.created carries proposedRouting and additionalRouting for a two-rule match', async () => {
      app.config.approvalNotify = 'webhook-only'

      await createApproval('Metropolis', 'metropolis-key')
      await app.approvalService.flushPendingNotifications()

      await vi.waitFor(() => expect(captured.native).toHaveLength(1))
      const data = captured.native[0].data
      expect(data.proposedRouting).toMatchObject({
        instanceId: 1,
        rootFolder: '/movies',
      })
      expect(data.additionalRouting).toEqual([
        expect.objectContaining({ instanceId: 1, rootFolder: '/movies-4k' }),
      ])
    })

    it('a request queued during an in-flight batch send is still notified', async () => {
      app.config.approvalNotify = 'webhook-only'
      const entered = createDeferred<void>()
      const release = createDeferred<void>()
      server.use(
        http.post(ADMIN_WEBHOOK, async ({ request }) => {
          const body = (await request.json()) as DiscordWire
          captured.discord.push({ url: ADMIN_WEBHOOK, body })
          entered.resolve()
          await release.promise
          return new HttpResponse(null, { status: 204 })
        }),
      )

      await createApproval('Metropolis', 'metropolis-key')
      const flushing = app.approvalService.flushPendingNotifications()
      await entered.promise
      await createApproval('Casablanca', 'casablanca-key')
      release.resolve()
      await flushing
      await app.approvalService.flushPendingNotifications()

      await vi.waitFor(() =>
        expect(
          captured.discord.map((post) => post.body.embeds?.[0].description),
        ).toEqual(['**Metropolis** (Movie)', '**Casablanca** (Movie)']),
      )
    })

    it('approval webhook and Apprise bodies show a label for router_rule', async () => {
      app.config.approvalNotify = 'all'

      await app.notifications.sendApprovalBatch(
        [
          approvalRequest({ triggeredBy: 'router_rule', approvalReason: null }),
          approvalRequest({
            id: 9,
            triggeredBy: 'content_criteria',
            approvalReason: null,
          }),
        ],
        2,
      )

      const text = JSON.stringify({
        discord: captured.discord,
        apprise: captured.apprise,
        dms: captured.dms,
      })
      expect(text).not.toContain('router_rule')
      expect(text).not.toContain('content_criteria')
    })
  })

  describe('Discord webhook URL hosts', () => {
    it('validates a canary webhook URL', async () => {
      server.use(
        http.get(CANARY_WEBHOOK, () => HttpResponse.json({ id: '300' })),
      )

      const res = await app.inject({
        method: 'POST',
        url: '/v1/notifications/validatewebhook',
        payload: { webhookUrls: CANARY_WEBHOOK },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().valid).toBe(true)
    })

    it('a canary webhook URL that validates also saves through the config route', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/v1/config',
        payload: { discordWebhookUrl: CANARY_WEBHOOK },
      })

      expect(res.statusCode).toBe(200)
    })
  })
})
