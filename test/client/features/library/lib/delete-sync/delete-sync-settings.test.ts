import { MAX_DELETION_PREVENTION } from '@root/schemas/shared/delete-sync-limits'
import {
  anyTypeSelected,
  deleteSyncValues,
  dryRunKey,
} from '@/features/library/lib/delete-sync/delete-sync-settings'

const saved = {
  deletionMode: 'watchlist',
  deleteSyncRequiredTagRegex: '',
  deleteMovie: true,
  deleteEndedShow: true,
  deleteContinuingShow: false,
  deleteFiles: true,
  deleteSyncCleanupApprovals: false,
  respectUserSyncSetting: true,
  deleteSyncTrackedOnly: false,
  maxDeletionPrevention: 10,
  enablePlexPlaylistProtection: false,
  plexProtectionPlaylistName: 'Do Not Delete',
  deleteSyncNotify: 'none',
  deleteSyncNotifyOnlyOnDeletion: false,
  removedTagPrefix: 'pulsarr-removed',
} as const

describe('dryRunKey', () => {
  it('matches for the same settings', () => {
    expect(dryRunKey({ ...saved })).toBe(dryRunKey(saved))
  })

  it.each([
    ['deletionMode', 'tag-based'],
    ['deleteContinuingShow', true],
    ['maxDeletionPrevention', 20],
    ['plexProtectionPlaylistName', 'Keep'],
    ['removedTagPrefix', 'pulsarr2-removed'],
  ] as const)('changes when %s changes', (key, value) => {
    expect(dryRunKey({ ...saved, [key]: value })).not.toBe(dryRunKey(saved))
  })

  it.each([
    ['deleteSyncNotify', 'all'],
    ['deleteSyncNotifyOnlyOnDeletion', true],
    ['deleteSyncCleanupApprovals', true],
  ] as const)('ignores %s, which a dry run does not report', (key, value) => {
    expect(dryRunKey({ ...saved, [key]: value })).toBe(dryRunKey(saved))
  })

  it('treats a missing max deletion as the default', () => {
    expect(dryRunKey({ ...saved, maxDeletionPrevention: undefined })).toBe(
      dryRunKey({
        ...saved,
        maxDeletionPrevention: MAX_DELETION_PREVENTION.default,
      }),
    )
  })

  it('ignores config this page does not own', () => {
    const config = { ...saved, removedTagMode: 'keep', deleteIntervalDays: 7 }
    expect(dryRunKey(config)).toBe(dryRunKey(saved))
  })
})

describe('deleteSyncValues', () => {
  it('leaves the removal tag fields to User tags', () => {
    expect(deleteSyncValues(saved)).not.toHaveProperty('removedTagPrefix')
    expect(deleteSyncValues(saved)).not.toHaveProperty('removedTagMode')
  })
})

describe('anyTypeSelected', () => {
  it('is false only when every content type is off', () => {
    const off = {
      deleteMovie: false,
      deleteEndedShow: false,
      deleteContinuingShow: false,
    }
    expect(anyTypeSelected(off)).toBe(false)
    expect(anyTypeSelected({ ...off, deleteContinuingShow: true })).toBe(true)
  })
})
