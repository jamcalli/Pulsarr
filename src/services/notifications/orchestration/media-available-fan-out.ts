import type { WebhookUser } from '@root/schemas/webhooks/webhook-payloads.schema.js'
import type {
  DeliveryResult,
  NotificationResult,
} from '@root/types/notification.types.js'
import { getPublicContentUrls } from '@root/utils/notifications/url-parser.js'
import { errorMessage } from '@utils/error-message.js'
import pLimit from 'p-limit'
import type { PlexMobileDelivery } from '../channels/plex-mobile.service.js'
import {
  dispatchNative,
  recipientLabel,
  sendAndLog,
  sendToUser,
} from '../dispatch.js'
import { describeContent } from '../templates/labels.js'
import { createMediaAvailableMessage } from '../templates/messages.js'
import type {
  DeliveryLine,
  DeliveryOutcome,
  NotificationDeps,
} from '../types.js'
import {
  type EnrichmentData,
  extractUserDiscordIds,
  type MediaAvailableOptions,
  type MediaInfo,
  PUBLIC_USER_ID,
} from './media-available-enrichment.js'
import {
  type ClaimedNotification,
  releaseClaim,
  updateDelivery,
} from './media-available-records.js'

export interface MediaFanOut {
  mediaInfo: MediaInfo
  options: MediaAvailableOptions
  enrichment: EnrichmentData
  claims: ClaimedNotification[]
  watchlisters: WebhookUser[]
}

type ChannelDelivery = Required<Omit<DeliveryOutcome, 'sent_to_native_webhook'>>

/** `plexQueued` settles once a Plex push held for indexing goes out or gives up. */
interface ClaimDelivery {
  sent: ChannelDelivery
  plexQueued?: Promise<DeliveryResult>
}

interface PlexMobileOutcome {
  sent: boolean
  queued?: Promise<DeliveryResult>
}

const USER_CONCURRENCY = 10

const NOTHING_SENT: ChannelDelivery = {
  sent_to_discord: false,
  sent_to_apprise: false,
  sent_to_plex_mobile: false,
}

async function sourceInstanceName(
  deps: NotificationDeps,
  options: MediaAvailableOptions,
): Promise<string | undefined> {
  const { instanceId, instanceType } = options
  if (!instanceId) return undefined
  try {
    const instance =
      instanceType === 'radarr'
        ? await deps.db.getRadarrInstance(instanceId)
        : instanceType === 'sonarr'
          ? await deps.db.getSonarrInstance(instanceId)
          : null
    return instance?.name
  } catch {
    return undefined
  }
}

function publicAppriseTarget(
  deps: NotificationDeps,
  notification: NotificationResult['notification'],
): string {
  const publicConfig = deps.config.publicContentNotifications
  const urls = getPublicContentUrls(publicConfig, notification.type, 'apprise')
  const configuredUrls =
    notification.type === 'movie'
      ? (publicConfig?.appriseUrlsMovies ?? publicConfig?.appriseUrls)
      : (publicConfig?.appriseUrlsShows ?? publicConfig?.appriseUrls)

  if (urls.length === 0 && configuredUrls) {
    deps.logger.warn(
      { contentType: notification.type, configuredUrls },
      'Public content Apprise URLs configured but none were valid. URLs must be Apprise-style (scheme://) or plain email addresses.',
    )
  }
  return urls.join(',')
}

async function deliverToPublic(
  deps: NotificationDeps,
  claim: ClaimedNotification,
  line: DeliveryLine,
  mentionDiscordIds: string[],
): Promise<ChannelDelivery> {
  const { user, notification } = claim
  const message = createMediaAvailableMessage(notification, mentionDiscordIds)
  const discordTarget = getPublicContentUrls(
    deps.config.publicContentNotifications,
    notification.type,
    'discord',
  ).join(',')
  const appriseTarget = user.notify_apprise
    ? publicAppriseTarget(deps, notification)
    : ''

  const [discord, apprise] = await Promise.all([
    user.notify_discord && discordTarget
      ? sendAndLog(deps.logger, line, 'Public Discord webhook', () =>
          deps.discordWebhook.sendNotification(discordTarget, message.webhook),
        )
      : false,
    appriseTarget
      ? sendAndLog(deps.logger, line, 'Public Apprise', () =>
          deps.apprise.sendNotification(appriseTarget, message.apprise),
        )
      : false,
  ])
  return {
    sent_to_discord: discord,
    sent_to_apprise: apprise,
    sent_to_plex_mobile: false,
  }
}

async function sendPlexMobile(
  deps: NotificationDeps,
  claim: ClaimedNotification,
  line: DeliveryLine,
  fanOut: MediaFanOut,
): Promise<PlexMobileOutcome> {
  const { user, notification } = claim
  if (!user.notify_plex_mobile || !deps.plexMobile.isEnabled()) {
    return { sent: false }
  }
  const delivery = await deps.plexMobile
    .sendNotification(
      user,
      notification,
      claim.watchlistItemKey,
      fanOut.mediaInfo.guid,
      fanOut.options.isBulkRelease,
    )
    .catch(
      (error): PlexMobileDelivery => ({
        ok: false,
        reason: errorMessage(error),
      }),
    )
  if ('queued' in delivery) return { sent: false, queued: delivery.queued }
  const sent = await sendAndLog(
    deps.logger,
    line,
    'Plex mobile',
    async () => delivery,
    recipientLabel(user),
  )
  return { sent }
}

async function deliverToUser(
  deps: NotificationDeps,
  claim: ClaimedNotification,
  line: DeliveryLine,
  fanOut: MediaFanOut,
): Promise<ClaimDelivery> {
  const user = await deps.db.getUser(claim.user.id)
  if (!user) {
    return {
      sent: NOTHING_SENT,
    }
  }
  const message = createMediaAvailableMessage(claim.notification, [])
  const [sent, plexMobile] = await Promise.all([
    sendToUser(deps, user, line, message),
    sendPlexMobile(
      deps,
      { ...claim, user },
      { ...line, userId: user.id },
      fanOut,
    ),
  ])
  return {
    sent: { ...sent, sent_to_plex_mobile: plexMobile.sent },
    plexQueued: plexMobile.queued,
  }
}

/** Logs the held Plex push once it settles and marks the row when it went out, or releases a claim nothing else delivered. */
async function settleQueuedPlexMobile(
  deps: NotificationDeps,
  claim: ClaimedNotification,
  line: DeliveryLine,
  queued: Promise<DeliveryResult>,
  delivery: Required<DeliveryOutcome>,
  delivered: boolean,
): Promise<boolean> {
  const sent = await sendAndLog(
    deps.logger,
    { ...line, userId: claim.user.id },
    'Plex mobile',
    () => queued,
    recipientLabel(claim.user),
  )
  if (sent) {
    await updateDelivery(deps, claim.recordId, {
      ...delivery,
      sent_to_plex_mobile: true,
    })
  } else if (!delivered) {
    await releaseClaim(deps, claim.recordId)
  }
  return sent
}

function dispatchMediaWebhook(
  deps: NotificationDeps,
  line: DeliveryLine,
  { mediaInfo, options, enrichment, watchlisters }: MediaFanOut,
): Promise<boolean> {
  const details = enrichment.episodeDetails
  return dispatchNative(deps, line, {
    event: 'media.available',
    payload: {
      mediaType: mediaInfo.type,
      title: mediaInfo.title,
      key: enrichment.content.key,
      guids: enrichment.guids,
      posterUrl: enrichment.posterUrl,
      episodeDetails:
        details?.seasonNumber !== undefined
          ? {
              seasonNumber: details.seasonNumber,
              episodeNumber: details.episodeNumber,
              title: details.title,
              overview: details.overview,
              airDateUtc: details.airDateUtc,
            }
          : undefined,
      isBulkRelease: options.isBulkRelease,
      instanceType: options.instanceType,
      instanceId: options.instanceId,
      watchlistedBy: watchlisters,
    },
  })
}

/** Never rejects. Sends every claim, fires `media.available`, then stores each claim's outcome or releases a claim that notified nobody. */
export async function deliverMediaAvailable(
  deps: NotificationDeps,
  fanOut: MediaFanOut,
): Promise<boolean> {
  const { mediaInfo, options, enrichment, claims } = fanOut
  const instanceName = await sourceInstanceName(deps, options)
  const what = describeContent(
    mediaInfo.title,
    mediaInfo.type,
    enrichment.episodeDetails,
  )
  const line: DeliveryLine = {
    event: 'mediaAvailable',
    summary: instanceName ? `${what} from ${instanceName}` : what,
    guid: mediaInfo.guid,
  }

  const native = dispatchMediaWebhook(deps, line, fanOut)
  const mentionDiscordIds = extractUserDiscordIds(claims)

  const deliverClaim = async (
    claim: ClaimedNotification,
  ): Promise<ClaimDelivery & { claim: ClaimedNotification }> => {
    try {
      const delivery: ClaimDelivery =
        claim.user.id === PUBLIC_USER_ID
          ? {
              sent: await deliverToPublic(deps, claim, line, mentionDiscordIds),
            }
          : await deliverToUser(deps, claim, line, fanOut)
      return { ...delivery, claim }
    } catch (error) {
      deps.logger.error(
        { error, recordId: claim.recordId, userId: claim.user.id },
        'Media available delivery failed for one watchlister',
      )
      return { sent: NOTHING_SENT, claim }
    }
  }

  const results: Array<ClaimDelivery & { claim: ClaimedNotification }> = []
  if (options.sequential) {
    for (const claim of claims) {
      results.push(await deliverClaim(claim))
    }
  } else {
    const limit = pLimit(USER_CONCURRENCY)
    results.push(
      ...(await Promise.all(
        claims.map((claim) => limit(() => deliverClaim(claim))),
      )),
    )
  }

  const nativeSent = await native
  const mentionsSent = results.some(
    ({ claim, sent }) =>
      claim.user.id === PUBLIC_USER_ID && sent.sent_to_discord,
  )
  for (const { claim, sent, plexQueued } of results) {
    const mentioned = mentionsSent && extractUserDiscordIds([claim]).length > 0
    const channels = mentioned ? { ...sent, sent_to_discord: true } : sent
    const delivery = { ...channels, sent_to_native_webhook: nativeSent }
    const delivered = Object.values(channels).some(Boolean)
    if (!delivered && !plexQueued) {
      await releaseClaim(deps, claim.recordId)
      continue
    }
    await updateDelivery(deps, claim.recordId, delivery)
    if (plexQueued) {
      deps.detach(
        settleQueuedPlexMobile(
          deps,
          claim,
          line,
          plexQueued,
          delivery,
          delivered,
        ),
      )
    }
  }

  return (
    nativeSent || results.some(({ sent }) => Object.values(sent).some(Boolean))
  )
}
