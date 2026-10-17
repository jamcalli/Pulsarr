import type { User } from '@root/types/config.types.js'
import type { DeliveryResult } from '@root/types/notification.types.js'
import { PlexMobileService } from '@services/notifications/channels/plex-mobile.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { createMockUser } from '../../../../mocks/user.js'
import { server } from '../../../../setup/msw-setup.js'

const PLEX_NOTIFICATIONS = 'https://notifications.plex.tv/api/v1/notifications'
const OWNER = { id: 1, name: 'owner' }
const FRIEND = { id: 2, name: 'friend' }

interface Setup {
  hasPlexPass?: boolean | null
  enabled?: boolean
  machineId?: string | null
  adminPlexId?: number | null
  isIndexed?: () => boolean
  storedUser?: () => User | undefined
}

function createService({
  hasPlexPass = true,
  enabled = true,
  machineId = 'machine-1',
  adminPlexId = 1001,
  isIndexed = () => true,
  storedUser = () =>
    createMockUser(FRIEND.id, FRIEND.name, { notify_plex_mobile: true }),
}: Setup = {}) {
  const fastify = {
    config: { plexMobileEnabled: enabled, plexTokens: ['server-token'] },
    db: { getUser: vi.fn(async () => storedUser()) },
    plexServerService: {
      getHasPlexPass: () => hasPlexPass,
      getServerMachineId: () => machineId,
      getServerName: () => 'Basement',
      resolveUserPlexId: vi.fn(async (user: Pick<User, 'id'>) => {
        if (user.id === OWNER.id) return adminPlexId
        return user.id === FRIEND.id ? 2002 : null
      }),
      isSSEConnected: () => true,
      searchByGuid: vi.fn(async () =>
        isIndexed() ? [{ ratingKey: 'show-1' }] : [],
      ),
      getShowMetadata: vi.fn(async () => ({
        MediaContainer: {
          Metadata: [
            {
              Children: {
                Metadata: [{ index: 1, ratingKey: 'season-1', leafCount: 2 }],
              },
            },
          ],
        },
      })),
      getMetadataChildren: vi.fn(async () => ({
        MediaContainer: {
          Metadata: [
            { index: 1, ratingKey: 'episode-1' },
            { index: 2, ratingKey: 'episode-2' },
          ],
        },
      })),
    },
  } as unknown as FastifyInstance
  return new PlexMobileService(createMockLogger(), fastify)
}

function captureRecipients() {
  const recipients: number[][] = []
  server.use(
    http.post(PLEX_NOTIFICATIONS, async ({ request }) => {
      const body = (await request.json()) as { to: number[] }
      recipients.push(body.to)
      return new HttpResponse(null)
    }),
  )
  return recipients
}

describe('PlexMobileService.testNotification', () => {
  it('sends to the owner through the admin Plex id', async () => {
    const recipients = captureRecipients()

    const result = await createService().testNotification(OWNER)

    expect(result.success).toBe(true)
    expect(result.responseTime).toBeGreaterThanOrEqual(0)
    expect(recipients).toEqual([[1001]])
  })

  it('sends to a friend through their matched Plex id', async () => {
    const recipients = captureRecipients()

    const result = await createService().testNotification(FRIEND)

    expect(result.success).toBe(true)
    expect(recipients).toEqual([[2002]])
  })

  it.each([
    ['not_configured', { hasPlexPass: null }],
    ['no_plex_pass', { hasPlexPass: false }],
    ['disabled', { enabled: false }],
  ] as const)('fails without sending when status is %s', async (_, setup) => {
    const recipients = captureRecipients()

    const result = await createService(setup).testNotification(OWNER)

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(recipients).toHaveLength(0)
  })

  it('fails without sending when no Plex server is connected', async () => {
    const recipients = captureRecipients()

    const result = await createService({ machineId: null }).testNotification(
      OWNER,
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(recipients).toHaveLength(0)
  })

  it('fails without sending when the user has no Plex account match', async () => {
    const recipients = captureRecipients()

    const result = await createService().testNotification({
      id: 9,
      plex_uuid: 'unmatched',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
    expect(recipients).toHaveLength(0)
  })
})

describe('PlexMobileService retry queue', () => {
  const VIEWER = createMockUser(2, 'friend', { notify_plex_mobile: true })

  function episode(episodeNumber: number) {
    return {
      type: 'show' as const,
      title: 'Severance',
      username: 'friend',
      episodeDetails: {
        seasonNumber: 1,
        episodeNumber,
        title: `Episode ${episodeNumber}`,
      },
    }
  }

  function captureUris() {
    const uris: string[] = []
    server.use(
      http.post(PLEX_NOTIFICATIONS, async ({ request }) => {
        const body = (await request.json()) as { uri: string }
        uris.push(body.uri)
        return new HttpResponse(null)
      }),
    )
    return uris
  }

  async function queueEpisodes(numbers: number[]) {
    let indexed = false
    const service = createService({ isIndexed: () => indexed })
    const queued: Array<Promise<DeliveryResult>> = []
    for (const n of numbers) {
      const sent = await service.sendNotification(
        VIEWER,
        episode(n),
        'severance-key',
        'tvdb:371980',
        false,
      )
      if (!('queued' in sent)) throw new Error('expected a queued delivery')
      queued.push(sent.queued)
    }
    indexed = true
    service.triggerRetryProcessing()
    return { service, queued }
  }

  it('sends a queued episode once Plex indexes it', async () => {
    const uris = captureUris()

    const { service, queued } = await queueEpisodes([1])

    expect(await queued[0]).toEqual({ ok: true })
    expect(uris).toEqual([
      'server://machine-1/com.plexapp.plugins.library/library/metadata/episode-1',
    ])
    service.shutdown()
  })

  it('drops a queued push without sending when the user turns Plex mobile off', async () => {
    const uris = captureUris()
    const stored = { ...VIEWER }
    let indexed = false
    const service = createService({
      isIndexed: () => indexed,
      storedUser: () => stored,
    })

    const sent = await service.sendNotification(
      VIEWER,
      episode(1),
      'severance-key',
      'tvdb:371980',
      false,
    )
    if (!('queued' in sent)) throw new Error('expected a queued delivery')
    stored.notify_plex_mobile = false
    indexed = true
    service.triggerRetryProcessing()

    expect(await sent.queued).toEqual({
      ok: false,
      reason: 'user turned off Plex mobile',
    })
    expect(uris).toHaveLength(0)
    service.shutdown()
  })

  it('settles a queued delivery as failed when the service shuts down', async () => {
    const service = createService({ isIndexed: () => false })

    const sent = await service.sendNotification(
      VIEWER,
      episode(1),
      'severance-key',
      'tvdb:371980',
      false,
    )
    if (!('queued' in sent)) throw new Error('expected a queued delivery')
    service.shutdown()

    expect(await sent.queued).toEqual({
      ok: false,
      reason: 'discarded at shutdown',
    })
  })

  it('keeps two queued episodes of one show for one user', async () => {
    const uris = captureUris()

    const { service } = await queueEpisodes([1, 2])

    await vi.waitFor(() => expect(uris).toHaveLength(2), { timeout: 500 })
    service.shutdown()
  })
})
