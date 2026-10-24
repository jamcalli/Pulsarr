import { useState } from 'react'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { FactList, FactListSkeleton } from '@/components/fact-list'
import { PinCredenza } from '@/components/plex/pin-credenza'
import { SyncSteps } from '@/components/plex/sync-steps'
import { TokenCredenza } from '@/components/plex/token-credenza'
import { ActionRow } from '@/components/settings/action-row'
import {
  FieldRowSkeleton,
  SettingsSectionSkeleton,
} from '@/components/settings/settings-page-skeleton'
import { SettingsSection } from '@/components/settings/settings-section'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import {
  FeedUrls,
  FeedUrlsSkeleton,
  GenerateFeedsRow,
} from '@/features/system/components/plex-connection/watchlist-feeds'
import { useUnlinkAccount } from '@/hooks/plex/useAccountToken'
import { useWatchlistSync } from '@/hooks/plex/useWatchlistSync'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { accountFacts, hasFeeds } from '@/lib/plex/account-facts'
import { isRunning, stepFailed } from '@/lib/plex/sync-run'
import type { components } from '@/types/api.js'

type Dialog = 'pin' | 'token' | 'unlink' | null

interface AccountCardProps {
  config: components['schemas']['Config']
  users: ReadonlyArray<components['schemas']['UserWithCount']>
  hasPlexPass: boolean
  linked: boolean
}

export function AccountCard({
  config,
  users,
  hasPlexPass,
  linked,
}: AccountCardProps) {
  const sync = useWatchlistSync()
  const syncStatus = useSyncStatus()
  const unlink = useUnlinkAccount()
  const [dialog, setDialog] = useState<Dialog>(null)
  const signInLabel = linked ? 'Relink with Plex' : 'Sign in with Plex'
  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null)
  }
  const onLinked = () => {
    setDialog(null)
    sync.start('link')
  }

  const linking = sync.run?.kind === 'link' && isRunning(sync.run)
  const showDetails = linked && !linking
  const pill = !linked
    ? { tone: 'off' as const, label: 'Not linked' }
    : linking
      ? { tone: 'pending' as const, label: 'Syncing' }
      : { tone: 'on' as const, label: 'Linked' }
  const facts = accountFacts({
    config,
    users,
    hasPlexPass,
    friendsSynced: !(
      sync.run?.kind === 'link' && stepFailed(sync.run, 'friends')
    ),
    sync: syncStatus,
  })
  const generated = hasFeeds(config)

  return (
    <>
      <SettingsSection
        title="Plex account"
        description="Pulsarr reads watchlists through the server owner's Plex account."
        action={<StatusPill tone={pill.tone} label={pill.label} live />}
      >
        {showDetails && <FactList facts={facts} />}
        {linked && (
          <ActionRow
            title="Sync watchlists"
            description="Read your and your friends' watchlists from Plex again."
            buttonLabel="Sync watchlists"
            busyLabel="Syncing..."
            disabled={false}
            running={sync.running}
            unavailableReason={sync.blockedReason}
            onRun={() => sync.start('resync')}
            live={sync.run && <SyncSteps run={sync.run} />}
          />
        )}
        {showDetails && generated && <FeedUrls config={config} />}
        {showDetails && (
          <GenerateFeedsRow
            generated={generated}
            hasPlexPass={hasPlexPass}
            syncing={sync.running}
          />
        )}
        <ActionRow
          title={signInLabel}
          description={
            linked
              ? 'Replace the linked token by approving Pulsarr on plex.tv.'
              : 'Approve Pulsarr on plex.tv. No token needed.'
          }
          running={false}
          actions={
            <Button
              type="button"
              size="sm"
              variant="plex"
              disabled={sync.running}
              onClick={() => setDialog('pin')}
            >
              {signInLabel}
            </Button>
          }
        />
        <ActionRow
          title="Paste a token"
          description={
            linked
              ? 'Replace the linked token with one you already have.'
              : 'For admins who already have a Plex token.'
          }
          buttonLabel="Paste token"
          busyLabel="Paste token"
          disabled={sync.running}
          running={false}
          onRun={() => setDialog('token')}
        />
        {linked && (
          <ActionRow
            title="Unlink account"
            description="Pulsarr stops syncing watchlists until you link again."
            buttonLabel="Unlink"
            busyLabel="Unlink"
            variant="destructive"
            disabled={sync.running}
            running={false}
            onRun={() => {
              unlink.reset()
              setDialog('unlink')
            }}
          />
        )}
      </SettingsSection>
      <PinCredenza
        open={dialog === 'pin'}
        onOpenChange={closeDialog}
        onLinked={onLinked}
      />
      <TokenCredenza
        open={dialog === 'token'}
        onOpenChange={closeDialog}
        onLinked={onLinked}
      />
      <ConfirmCredenza
        open={dialog === 'unlink'}
        onOpenChange={closeDialog}
        title="Unlink Plex account"
        description="Watchlist syncing stops until you link again. Requests and settings stay."
        confirmLabel="Unlink account"
        confirmVariant="destructive"
        pending={unlink.pending}
        pendingLabel="Unlinking..."
        errorMessage={unlink.errorMessage}
        onConfirm={() =>
          unlink.unlink(undefined, { onSuccess: () => setDialog(null) })
        }
      />
    </>
  )
}

export function AccountCardSkeleton() {
  return (
    <SettingsSectionSkeleton pill>
      <FactListSkeleton rows={4} />
      <FieldRowSkeleton control="field" />
      <FeedUrlsSkeleton />
      <FieldRowSkeleton control="field" />
      <FieldRowSkeleton control="field" />
      <FieldRowSkeleton control="field" />
      <FieldRowSkeleton control="field" />
    </SettingsSectionSkeleton>
  )
}
