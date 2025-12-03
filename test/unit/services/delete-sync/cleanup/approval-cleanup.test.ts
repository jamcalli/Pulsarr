import type { ApprovalCleanupDeps } from '@services/delete-sync/cleanup/approval-cleanup.js'
import { cleanupApprovalRequestsForDeletedContent } from '@services/delete-sync/cleanup/index.js'
import type { FastifyBaseLogger } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

describe('approval-cleanup', () => {
  const createMockLogger = (): FastifyBaseLogger =>
    ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(() => createMockLogger()),
    }) as unknown as FastifyBaseLogger

  const createMockApprovalService = (deleteSuccess = true) => ({
    deleteApprovalRequest: vi.fn().mockImplementation(async () => {
      if (!deleteSuccess) {
        throw new Error('Delete failed')
      }
      return true
    }),
  })

  const createMockDb = (
    movieApprovals: any[] = [],
    showApprovals: any[] = [],
  ) => ({
    getApprovalRequestsByGuids: vi
      .fn()
      .mockImplementation(async (_guids, type) => {
        return type === 'movie' ? movieApprovals : showApprovals
      }),
  })

  describe('cleanupApprovalRequestsForDeletedContent', () => {
    it('should skip cleanup when deleteSyncCleanupApprovals is false', async () => {
      const deps: ApprovalCleanupDeps = {
        db: createMockDb() as any,
        approvalService: createMockApprovalService() as any,
        deletedMovieGuids: new Set(['guid1']),
        deletedShowGuids: new Set(['guid2']),
        config: { deleteSyncCleanupApprovals: false },
        log: createMockLogger(),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(deps.db.getApprovalRequestsByGuids).not.toHaveBeenCalled()
      expect(deps.approvalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should skip cleanup when dryRun is true', async () => {
      const deps: ApprovalCleanupDeps = {
        db: createMockDb() as any,
        approvalService: createMockApprovalService() as any,
        deletedMovieGuids: new Set(['guid1']),
        deletedShowGuids: new Set(['guid2']),
        config: { deleteSyncCleanupApprovals: true },
        log: createMockLogger(),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, true)

      expect(deps.db.getApprovalRequestsByGuids).not.toHaveBeenCalled()
      expect(deps.approvalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should skip cleanup when no deleted GUIDs exist', async () => {
      const deps: ApprovalCleanupDeps = {
        db: createMockDb() as any,
        approvalService: createMockApprovalService() as any,
        deletedMovieGuids: new Set(),
        deletedShowGuids: new Set(),
        config: { deleteSyncCleanupApprovals: true },
        log: createMockLogger(),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(deps.db.getApprovalRequestsByGuids).not.toHaveBeenCalled()
      expect(deps.approvalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should clean up movie approval requests', async () => {
      const movieApprovals = [
        { id: 1, contentTitle: 'Movie 1', guids: ['plex://movie/1'] },
        { id: 2, contentTitle: 'Movie 2', guids: ['plex://movie/2'] },
      ]
      const deps: ApprovalCleanupDeps = {
        db: createMockDb(movieApprovals) as any,
        approvalService: createMockApprovalService() as any,
        deletedMovieGuids: new Set(['plex://movie/1', 'plex://movie/2']),
        deletedShowGuids: new Set(),
        config: { deleteSyncCleanupApprovals: true },
        log: createMockLogger(),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(deps.db.getApprovalRequestsByGuids).toHaveBeenCalledWith(
        deps.deletedMovieGuids,
        'movie',
      )
      expect(deps.approvalService.deleteApprovalRequest).toHaveBeenCalledTimes(
        2,
      )
      expect(deps.approvalService.deleteApprovalRequest).toHaveBeenCalledWith(1)
      expect(deps.approvalService.deleteApprovalRequest).toHaveBeenCalledWith(2)
      expect(deps.log.info).toHaveBeenCalledWith(
        expect.stringContaining('2 deleted GUIDs'),
      )
      expect(deps.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 2 movie approval records'),
      )
      expect(deps.log.info).toHaveBeenCalledWith(
        'Total approval requests cleaned up: 2',
      )
    })

    it('should clean up show approval requests', async () => {
      const showApprovals = [
        { id: 3, contentTitle: 'Show 1', guids: ['plex://show/1'] },
        { id: 4, contentTitle: 'Show 2', guids: ['plex://show/2'] },
        { id: 5, contentTitle: 'Show 3', guids: ['plex://show/3'] },
      ]
      const deps: ApprovalCleanupDeps = {
        db: createMockDb([], showApprovals) as any,
        approvalService: createMockApprovalService() as any,
        deletedMovieGuids: new Set(),
        deletedShowGuids: new Set([
          'plex://show/1',
          'plex://show/2',
          'plex://show/3',
        ]),
        config: { deleteSyncCleanupApprovals: true },
        log: createMockLogger(),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(deps.db.getApprovalRequestsByGuids).toHaveBeenCalledWith(
        deps.deletedShowGuids,
        'show',
      )
      expect(deps.approvalService.deleteApprovalRequest).toHaveBeenCalledTimes(
        3,
      )
      expect(deps.approvalService.deleteApprovalRequest).toHaveBeenCalledWith(3)
      expect(deps.approvalService.deleteApprovalRequest).toHaveBeenCalledWith(4)
      expect(deps.approvalService.deleteApprovalRequest).toHaveBeenCalledWith(5)
      expect(deps.log.info).toHaveBeenCalledWith(
        expect.stringContaining('3 deleted GUIDs'),
      )
      expect(deps.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 3 show approval records'),
      )
      expect(deps.log.info).toHaveBeenCalledWith(
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
      const deps: ApprovalCleanupDeps = {
        db: createMockDb(movieApprovals, showApprovals) as any,
        approvalService: createMockApprovalService() as any,
        deletedMovieGuids: new Set(['plex://movie/1']),
        deletedShowGuids: new Set(['plex://show/1', 'plex://show/2']),
        config: { deleteSyncCleanupApprovals: true },
        log: createMockLogger(),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(deps.db.getApprovalRequestsByGuids).toHaveBeenCalledTimes(2)
      expect(deps.approvalService.deleteApprovalRequest).toHaveBeenCalledTimes(
        3,
      )
      expect(deps.log.info).toHaveBeenCalledWith(
        'Total approval requests cleaned up: 3',
      )
    })

    it('should continue cleanup on individual delete errors', async () => {
      const movieApprovals = [
        { id: 1, contentTitle: 'Movie 1', guids: ['plex://movie/1'] },
        { id: 2, contentTitle: 'Movie 2', guids: ['plex://movie/2'] },
        { id: 3, contentTitle: 'Movie 3', guids: ['plex://movie/3'] },
      ]
      const mockApprovalService = {
        deleteApprovalRequest: vi.fn().mockImplementation(async (id) => {
          if (id === 2) {
            throw new Error('Delete failed for approval 2')
          }
          return true
        }),
      }
      const deps: ApprovalCleanupDeps = {
        db: createMockDb(movieApprovals) as any,
        approvalService: mockApprovalService as any,
        deletedMovieGuids: new Set([
          'plex://movie/1',
          'plex://movie/2',
          'plex://movie/3',
        ]),
        deletedShowGuids: new Set(),
        config: { deleteSyncCleanupApprovals: true },
        log: createMockLogger(),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      // Should attempt all 3 deletes
      expect(deps.approvalService.deleteApprovalRequest).toHaveBeenCalledTimes(
        3,
      )
      // Should log error for failed delete
      expect(deps.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalId: 2,
          title: 'Movie 2',
        }),
        'Error deleting individual approval request during cleanup',
      )
      // Should still count successful deletes
      expect(deps.log.info).toHaveBeenCalledWith(
        'Total approval requests cleaned up: 2',
      )
    })

    it('should handle database fetch errors gracefully', async () => {
      const mockDb = {
        getApprovalRequestsByGuids: vi
          .fn()
          .mockRejectedValue(new Error('Database error')),
      }
      const deps: ApprovalCleanupDeps = {
        db: mockDb as any,
        approvalService: createMockApprovalService() as any,
        deletedMovieGuids: new Set(['guid1']),
        deletedShowGuids: new Set(),
        config: { deleteSyncCleanupApprovals: true },
        log: createMockLogger(),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      expect(deps.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        }),
        'Error cleaning up approval requests for deleted content',
      )
      expect(deps.approvalService.deleteApprovalRequest).not.toHaveBeenCalled()
    })

    it('should not log total when no approvals were cleaned', async () => {
      const deps: ApprovalCleanupDeps = {
        db: createMockDb([], []) as any, // No approvals found
        approvalService: createMockApprovalService() as any,
        deletedMovieGuids: new Set(['guid1']),
        deletedShowGuids: new Set(['guid2']),
        config: { deleteSyncCleanupApprovals: true },
        log: createMockLogger(),
      }

      await cleanupApprovalRequestsForDeletedContent(deps, false)

      // Should fetch but find nothing
      expect(deps.db.getApprovalRequestsByGuids).toHaveBeenCalledTimes(2)
      expect(deps.approvalService.deleteApprovalRequest).not.toHaveBeenCalled()
      // Should not log total cleanup message
      expect(deps.log.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Total approval requests cleaned up'),
      )
    })
  })
})
