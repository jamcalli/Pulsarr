import type { Config } from '@root/types/config.types.js'
import type { Friend } from '@root/types/plex.types.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  checkForRemovedFriends,
  ensureFriendUsers,
  type FriendUsersDeps,
} from '@services/plex-watchlist/users/friend-users.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { createMockUser } from '../../../../mocks/user.js'

function friendSet(...friends: Friend[]): Set<[Friend, string]> {
  return new Set(friends.map((friend) => [friend, 'token'] as [Friend, string]))
}

function friend(watchlistId: string, username: string): Friend {
  return { watchlistId, username, userId: 0 }
}

describe('friend-users', () => {
  let mockDb: {
    getOrCreateUser: ReturnType<typeof vi.fn>
    updateUser: ReturnType<typeof vi.fn>
    getAllUsers: ReturnType<typeof vi.fn>
    getPrimaryUser: ReturnType<typeof vi.fn>
    deleteUsers: ReturnType<typeof vi.fn>
  }
  let deps: FriendUsersDeps
  let emit: ReturnType<typeof vi.fn>

  beforeEach(() => {
    emit = vi.fn()
    mockDb = {
      getOrCreateUser: vi.fn(),
      updateUser: vi.fn(),
      getAllUsers: vi.fn(),
      getPrimaryUser: vi.fn(),
      deleteUsers: vi.fn(async (ids: number[]) => ({
        deletedCount: ids.length,
        failedIds: [],
      })),
    }
    deps = {
      config: {} as Config,
      db: mockDb as unknown as DatabaseService,
      logger: createMockLogger(),
      fastify: {
        notifications: { sendUserCreated: vi.fn() },
        progress: { emit },
        quotaService: {
          setupDefaultQuotas: vi.fn(async () => ({
            movieQuota: null,
            showQuota: null,
          })),
        },
      } as unknown as FastifyInstance,
    }
  })

  describe('ensureFriendUsers', () => {
    it('renames an existing user matched by plex uuid', async () => {
      mockDb.getAllUsers.mockResolvedValue([
        createMockUser(5, 'old-name', { plex_uuid: 'uuid-1' }),
      ])

      const { userMap, added } = await ensureFriendUsers(
        friendSet(friend('uuid-1', 'new-name')),
        deps,
      )

      expect(mockDb.updateUser).toHaveBeenCalledWith(5, { name: 'new-name' })
      expect(mockDb.getOrCreateUser).not.toHaveBeenCalled()
      expect(userMap.get('uuid-1')).toEqual({ userId: 5, username: 'new-name' })
      expect(added).toEqual([])
    })

    it('keeps the stored name when the new username is still held by another user', async () => {
      mockDb.getAllUsers.mockResolvedValue([
        createMockUser(5, 'old-name', { plex_uuid: 'uuid-1' }),
        createMockUser(6, 'new-name', { plex_uuid: 'uuid-2' }),
      ])

      const { userMap } = await ensureFriendUsers(
        friendSet(friend('uuid-1', 'new-name')),
        deps,
      )

      expect(mockDb.updateUser).not.toHaveBeenCalled()
      expect(userMap.get('uuid-1')).toEqual({ userId: 5, username: 'new-name' })
    })

    it('falls through to getOrCreateUser when no uuid matches', async () => {
      mockDb.getAllUsers.mockResolvedValue([
        createMockUser(9, 'carol', { plex_uuid: 'uuid-other' }),
      ])
      mockDb.getOrCreateUser.mockResolvedValue({
        user: createMockUser(7, 'alice', { plex_uuid: 'uuid-2' }),
        created: false,
      })

      await ensureFriendUsers(friendSet(friend('uuid-2', 'alice')), deps)

      expect(mockDb.getOrCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'alice', plex_uuid: 'uuid-2' }),
      )
      expect(mockDb.updateUser).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    })

    it('emits a users added event for a created user', async () => {
      mockDb.getAllUsers.mockResolvedValue([])
      mockDb.getOrCreateUser.mockResolvedValue({
        user: createMockUser(7, 'alice', { plex_uuid: 'uuid-2' }),
        created: true,
      })

      await ensureFriendUsers(friendSet(friend('uuid-2', 'alice')), deps)

      expect(emit).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'users-7',
          type: 'users',
          phase: 'added',
          progress: 100,
          metadata: { action: 'added', userId: 7, plexUuid: 'uuid-2' },
        }),
      )
    })
  })

  describe('checkForRemovedFriends', () => {
    const primary = createMockUser(1, 'owner', { is_primary_token: true })

    beforeEach(() => {
      mockDb.getPrimaryUser.mockResolvedValue(primary)
    })

    it('keeps a user whose uuid is in the friend set despite a username mismatch', async () => {
      mockDb.getAllUsers.mockResolvedValue([
        primary,
        createMockUser(2, 'old-name', { plex_uuid: 'uuid-1' }),
      ])

      const removed = await checkForRemovedFriends(
        friendSet(friend('uuid-1', 'new-name')),
        deps,
      )

      expect(mockDb.deleteUsers).not.toHaveBeenCalled()
      expect(removed).toEqual([])
    })

    it('keeps a user with no uuid on a case-insensitive username match', async () => {
      mockDb.getAllUsers.mockResolvedValue([
        primary,
        createMockUser(2, 'Alice', { plex_uuid: null }),
      ])

      await checkForRemovedFriends(friendSet(friend('uuid-1', 'alice')), deps)

      expect(mockDb.deleteUsers).not.toHaveBeenCalled()
    })

    it('deletes a user with no uuid on a username mismatch', async () => {
      mockDb.getAllUsers.mockResolvedValue([
        primary,
        createMockUser(2, 'bob', { plex_uuid: null }),
      ])

      const removed = await checkForRemovedFriends(
        friendSet(friend('uuid-1', 'alice')),
        deps,
      )

      expect(mockDb.deleteUsers).toHaveBeenCalledWith([2])
      expect(removed).toEqual([
        { userId: 2, username: 'bob', isPrimary: false },
      ])
      expect(emit).toHaveBeenCalledTimes(1)
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'users-2',
          type: 'users',
          phase: 'removed',
          progress: 100,
          metadata: { action: 'removed', userId: 2, plexUuid: null },
        }),
      )
    })

    it('deletes a user whose uuid is not in the set even when the username matches', async () => {
      mockDb.getAllUsers.mockResolvedValue([
        primary,
        createMockUser(2, 'alice', { plex_uuid: 'uuid-old' }),
      ])

      await checkForRemovedFriends(friendSet(friend('uuid-new', 'alice')), deps)

      expect(mockDb.deleteUsers).toHaveBeenCalledWith([2])
    })

    it('never deletes the primary user', async () => {
      mockDb.getAllUsers.mockResolvedValue([primary])

      await checkForRemovedFriends(friendSet(), deps)

      expect(mockDb.deleteUsers).not.toHaveBeenCalled()
    })
  })
})
