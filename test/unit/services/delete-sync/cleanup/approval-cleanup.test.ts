/**
 * Unit tests for approval-cleanup module
 *
 * Tests cleanup of approval requests when content is deleted during
 * delete sync operations. Verifies proper handling of movie and show
 * approvals, error recovery, and dry run behavior.
 */

import type { ApprovalService } from '@services/approval.service.js'
import type { DatabaseService } from '@services/database.service.js'
import type { ApprovalCleanupDeps } from '@services/delete-sync/cleanup/approval-cleanup.js'
import { cleanupApprovalRequestsForDeletedContent } from '@services/delete-sync/cleanup/index.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

describe('approval-cleanup', () => {
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockDb: {
    getApprovalRequestsByGuids: ReturnType<typeof vi.fn>
  }
  let mockApprovalService: {
    deleteApprovalRequest: ReturnType<typeof vi.fn>
  }
  let baseDeps: ApprovalCleanupDeps

  beforeEach(() => {
    mockLogger = createMockLogger()
    mockDb = {
      getApprovalRequestsByGuids: vi.fn().mockResolvedValue([]),
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
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('2 deleted GUIDs'),
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 2 movie approval records'),
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Total approval requests cleaned up: 2',
      )
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
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('3 deleted GUIDs'),
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 3 show approval records'),
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Total approval requests cleaned up: 3',
      )
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
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Total approval requests cleaned up: 3',
      )
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
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalId: 2,
          title: 'Movie 2',
        }),
        'Error deleting individual approval request during cleanup',
      )
      // Should still count successful deletes
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Total approval requests cleaned up: 2',
      )
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

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        }),
        'Error cleaning up approval requests for deleted content',
      )
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
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Total approval requests cleaned up'),
      )
    })
  })
})
