/**
 * Unit tests for approval-cleanup module
 *
 * Tests cleanup of approval requests when content is deleted during
 * delete sync operations. Verifies proper handling of movie and show
 * approvals, error recovery, and dry run behavior.
 */

import type { ApprovalRequest } from '@root/types/approval.types.js'
import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type {
  ApprovalCleanupDeps,
  OrphanedApprovalCleanupDeps,
} from '@services/delete-sync/cleanup/approval-cleanup.js'
import {
  cleanupApprovalRequestsForDeletedContent,
  cleanupOrphanedApprovalRequests,
} from '@services/delete-sync/cleanup/index.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

/** Helper to create a minimal ApprovalRequest for testing */
function makeApproval(
  overrides: Partial<ApprovalRequest> & {
    id: number
    contentType: 'movie' | 'show'
    contentGuids: string[]
  },
): ApprovalRequest {
  return {
    userId: 1,
    userName: 'Test User',
    contentTitle: `Content ${overrides.id}`,
    contentKey: `key-${overrides.id}`,
    proposedRouterDecision: { action: 'continue' as const },
    routerRuleId: null,
    triggeredBy: 'quota_exceeded',
    approvalReason: null,
    status: 'approved',
    approvedBy: null,
    approvalNotes: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('approval-cleanup', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockDb: {
    getApprovalRequestsByGuids: ReturnType<typeof vi.fn>
    getAllApprovedApprovalRequests: ReturnType<typeof vi.fn>
  }
  let mockApprovalService: {
    deleteApprovalRequest: ReturnType<typeof vi.fn>
  }
  let baseDeps: ApprovalCleanupDeps

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockDb = {
      getApprovalRequestsByGuids: vi.fn().mockResolvedValue([]),
      getAllApprovedApprovalRequests: vi.fn().mockResolvedValue([]),
    }
    mockApprovalService = {
      deleteApprovalRequest: vi.fn().mockResolvedValue(true),
    }
    baseDeps = {
      db: mockDb as unknown as DatabaseService,
      approvalService: mockApprovalService as unknown as ApprovalService,
      deletedMovieGuids: new Set(),
      deletedShowGuids: new Set(),
      config: { deleteSyncCleanupApprovals: true },
      logger: mockLogger,
    }
  })

  describe('cleanupApprovalRequestsForDeletedContent', () => {
    it('should skip cleanup when deleteSyncCleanupApprovals is false', async () => {
      const deps = {
        ...baseDeps,
        deletedMovieGuids: new Set(['guid1']),
        deletedShowGuids: new Set(['guid2']),
        config: { deleteSyncCleanupApprovals: false },
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(mockDb.getApprovalRequestsByGuids).not.toHaveBeenCalled()
      expect(mockApprovalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should skip cleanup when dryRun is true', async () => {
      const deps = {
        ...baseDeps,
        deletedMovieGuids: new Set(['guid1']),
        deletedShowGuids: new Set(['guid2']),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, true)

      expect(mockDb.getApprovalRequestsByGuids).not.toHaveBeenCalled()
      expect(mockApprovalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should skip cleanup when no deleted GUIDs exist', async () => {
      await cleanupApprovalRequestsForDeletedContent(baseDeps, false)

      expect(mockDb.getApprovalRequestsByGuids).not.toHaveBeenCalled()
      expect(mockApprovalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should clean up movie approval requests', async () => {
      const movieApprovals = [
        { id: 1, contentTitle: 'Movie 1', guids: ['plex://movie/1'] },
        { id: 2, contentTitle: 'Movie 2', guids: ['plex://movie/2'] },
      ]
      mockDb.getApprovalRequestsByGuids.mockImplementation(
        async (_guids, type) => {
          return type === 'movie' ? movieApprovals : []
        },
      )

      const deps = {
        ...baseDeps,
        deletedMovieGuids: new Set(['plex://movie/1', 'plex://movie/2']),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(mockDb.getApprovalRequestsByGuids).toHaveBeenCalledWith(
        deps.deletedMovieGuids,
        'movie',
      )
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledTimes(2)
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(1)
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(2)
    })

    it('should clean up show approval requests', async () => {
      const showApprovals = [
        { id: 3, contentTitle: 'Show 1', guids: ['plex://show/1'] },
        { id: 4, contentTitle: 'Show 2', guids: ['plex://show/2'] },
        { id: 5, contentTitle: 'Show 3', guids: ['plex://show/3'] },
      ]
      mockDb.getApprovalRequestsByGuids.mockImplementation(
        async (_guids, type) => {
          return type === 'show' ? showApprovals : []
        },
      )

      const deps = {
        ...baseDeps,
        deletedShowGuids: new Set([
          'plex://show/1',
          'plex://show/2',
          'plex://show/3',
        ]),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(mockDb.getApprovalRequestsByGuids).toHaveBeenCalledWith(
        deps.deletedShowGuids,
        'show',
      )
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledTimes(3)
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(3)
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(4)
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(5)
    })

    it('should clean up both movie and show approval requests', async () => {
      const movieApprovals = [
        { id: 1, contentTitle: 'Movie 1', guids: ['plex://movie/1'] },
      ]
      const showApprovals = [
        { id: 2, contentTitle: 'Show 1', guids: ['plex://show/1'] },
        { id: 3, contentTitle: 'Show 2', guids: ['plex://show/2'] },
      ]
      mockDb.getApprovalRequestsByGuids.mockImplementation(
        async (_guids, type) => {
          return type === 'movie' ? movieApprovals : showApprovals
        },
      )

      const deps = {
        ...baseDeps,
        deletedMovieGuids: new Set(['plex://movie/1']),
        deletedShowGuids: new Set(['plex://show/1', 'plex://show/2']),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(mockDb.getApprovalRequestsByGuids).toHaveBeenCalledTimes(2)
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledTimes(3)
    })

    it('should continue cleanup on individual delete errors', async () => {
      const movieApprovals = [
        { id: 1, contentTitle: 'Movie 1', guids: ['plex://movie/1'] },
        { id: 2, contentTitle: 'Movie 2', guids: ['plex://movie/2'] },
        { id: 3, contentTitle: 'Movie 3', guids: ['plex://movie/3'] },
      ]
      mockDb.getApprovalRequestsByGuids.mockResolvedValue(movieApprovals)
      mockApprovalService.deleteApprovalRequest.mockImplementation(
        async (id) => {
          if (id === 2) {
            throw new Error('Delete failed for approval 2')
          }
          return true
        },
      )

      const deps = {
        ...baseDeps,
        deletedMovieGuids: new Set([
          'plex://movie/1',
          'plex://movie/2',
          'plex://movie/3',
        ]),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      // Should attempt all 3 deletes
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledTimes(3)
      // Should log error for failed delete
      // Should still count successful deletes
    })

    it('should handle database fetch errors gracefully', async () => {
      mockDb.getApprovalRequestsByGuids.mockRejectedValue(
        new Error('Database error'),
      )

      const deps = {
        ...baseDeps,
        deletedMovieGuids: new Set(['guid1']),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(mockApprovalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should not log total when no approvals were cleaned', async () => {
      mockDb.getApprovalRequestsByGuids.mockResolvedValue([])

      const deps = {
        ...baseDeps,
        deletedMovieGuids: new Set(['guid1']),
        deletedShowGuids: new Set(['guid2']),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      // Should fetch but find nothing
      expect(mockDb.getApprovalRequestsByGuids).toHaveBeenCalledTimes(2)
      expect(mockApprovalService.deleteApprovalRequest).not.toHaveBeenCalled()
      // Should not log total cleanup message
    })
  })

  describe('cleanupOrphanedApprovalRequests', () => {
    let orphanDeps: OrphanedApprovalCleanupDeps

    beforeEach(() => {
      orphanDeps = {
        db: mockDb as unknown as DatabaseService,
        approvalService: mockApprovalService as unknown as ApprovalService,
        existingMovieGuids: new Set(['tmdb:100', 'imdb:tt100']),
        existingShowGuids: new Set(['tmdb:200', 'tvdb:200']),
        config: { deleteSyncCleanupApprovals: true },
        logger: mockLogger,
      }
    })

    it('should skip when deleteSyncCleanupApprovals is false', async () => {
      const deps = {
        ...orphanDeps,
        config: { deleteSyncCleanupApprovals: false },
      }

      const result = await cleanupOrphanedApprovalRequests(deps, false)

      expect(result).toEqual({ cleaned: 0 })
      expect(mockDb.getAllApprovedApprovalRequests).not.toHaveBeenCalled()
    })

    it('should skip when dryRun is true', async () => {
      const result = await cleanupOrphanedApprovalRequests(orphanDeps, true)

      expect(result).toEqual({ cleaned: 0 })
      expect(mockDb.getAllApprovedApprovalRequests).not.toHaveBeenCalled()
    })

    it('should delete orphaned movie records', async () => {
      mockDb.getAllApprovedApprovalRequests.mockResolvedValue([
        makeApproval({
          id: 1,
          contentType: 'movie',
          contentGuids: ['tmdb:100'],
        }),
        makeApproval({
          id: 2,
          contentType: 'movie',
          contentGuids: ['tmdb:999'],
        }),
      ])

      const result = await cleanupOrphanedApprovalRequests(orphanDeps, false)

      expect(result).toEqual({ cleaned: 1 })
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(2)
      expect(
        mockApprovalService.deleteApprovalRequest,
      ).not.toHaveBeenCalledWith(1)
    })

    it('should delete orphaned show records', async () => {
      mockDb.getAllApprovedApprovalRequests.mockResolvedValue([
        makeApproval({
          id: 3,
          contentType: 'show',
          contentGuids: ['tmdb:888'],
        }),
      ])

      const result = await cleanupOrphanedApprovalRequests(orphanDeps, false)

      expect(result).toEqual({ cleaned: 1 })
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(3)
    })

    it('should keep records where any GUID matches', async () => {
      mockDb.getAllApprovedApprovalRequests.mockResolvedValue([
        makeApproval({
          id: 1,
          contentType: 'movie',
          contentGuids: ['plex:movie/abc', 'tmdb:100'],
        }),
      ])

      const result = await cleanupOrphanedApprovalRequests(orphanDeps, false)

      expect(result).toEqual({ cleaned: 0 })
      expect(mockApprovalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should skip content type when GUID set is empty (no instances configured)', async () => {
      const deps = {
        ...orphanDeps,
        existingMovieGuids: new Set<string>(),
      }

      mockDb.getAllApprovedApprovalRequests.mockResolvedValue([
        makeApproval({
          id: 1,
          contentType: 'movie',
          contentGuids: ['tmdb:999'],
        }),
        makeApproval({
          id: 2,
          contentType: 'show',
          contentGuids: ['tmdb:888'],
        }),
      ])

      const result = await cleanupOrphanedApprovalRequests(deps, false)

      // Movie record skipped (empty set), show record orphaned
      expect(result).toEqual({ cleaned: 1 })
      expect(
        mockApprovalService.deleteApprovalRequest,
      ).not.toHaveBeenCalledWith(1)
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(2)
    })

    it('should handle mixed movie and show records', async () => {
      mockDb.getAllApprovedApprovalRequests.mockResolvedValue([
        makeApproval({
          id: 1,
          contentType: 'movie',
          contentGuids: ['tmdb:100'],
        }),
        makeApproval({
          id: 2,
          contentType: 'movie',
          contentGuids: ['tmdb:999'],
        }),
        makeApproval({
          id: 3,
          contentType: 'show',
          contentGuids: ['tvdb:200'],
        }),
        makeApproval({
          id: 4,
          contentType: 'show',
          contentGuids: ['tvdb:999'],
        }),
      ])

      const result = await cleanupOrphanedApprovalRequests(orphanDeps, false)

      expect(result).toEqual({ cleaned: 2 })
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(2)
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(4)
      expect(
        mockApprovalService.deleteApprovalRequest,
      ).not.toHaveBeenCalledWith(1)
      expect(
        mockApprovalService.deleteApprovalRequest,
      ).not.toHaveBeenCalledWith(3)
    })

    it('should continue on individual delete errors', async () => {
      mockDb.getAllApprovedApprovalRequests.mockResolvedValue([
        makeApproval({
          id: 1,
          contentType: 'movie',
          contentGuids: ['tmdb:777'],
        }),
        makeApproval({
          id: 2,
          contentType: 'movie',
          contentGuids: ['tmdb:888'],
        }),
        makeApproval({
          id: 3,
          contentType: 'movie',
          contentGuids: ['tmdb:999'],
        }),
      ])
      mockApprovalService.deleteApprovalRequest.mockImplementation(
        async (id) => {
          if (id === 2) throw new Error('Delete failed')
          return true
        },
      )

      const result = await cleanupOrphanedApprovalRequests(orphanDeps, false)

      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledTimes(3)
      // Only 2 succeeded (id 1 and 3), id 2 threw
      expect(result).toEqual({ cleaned: 2 })
    })

    it('should handle database fetch errors gracefully', async () => {
      mockDb.getAllApprovedApprovalRequests.mockRejectedValue(
        new Error('Database error'),
      )

      const result = await cleanupOrphanedApprovalRequests(orphanDeps, false)

      expect(result).toEqual({ cleaned: 0 })
      expect(mockApprovalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should treat records with empty contentGuids as orphaned', async () => {
      mockDb.getAllApprovedApprovalRequests.mockResolvedValue([
        makeApproval({
          id: 1,
          contentType: 'movie',
          contentGuids: [],
        }),
      ])

      const result = await cleanupOrphanedApprovalRequests(orphanDeps, false)

      expect(result).toEqual({ cleaned: 1 })
      expect(mockApprovalService.deleteApprovalRequest).toHaveBeenCalledWith(1)
    })

    it('should return cleaned 0 when no records are orphaned', async () => {
      mockDb.getAllApprovedApprovalRequests.mockResolvedValue([
        makeApproval({
          id: 1,
          contentType: 'movie',
          contentGuids: ['tmdb:100'],
        }),
        makeApproval({
          id: 2,
          contentType: 'show',
          contentGuids: ['tvdb:200'],
        }),
      ])

      const result = await cleanupOrphanedApprovalRequests(orphanDeps, false)

      expect(result).toEqual({ cleaned: 0 })
      expect(mockApprovalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })
  })
})
