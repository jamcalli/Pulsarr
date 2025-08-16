import { useEffect, useState } from 'react'
import type { z } from 'zod'
import BulkEditModal from '@/features/plex/components/user/bulk-edit-modal'
import {
  BulkQuotaEditModal,
  type BulkQuotaFormSchema,
} from '@/features/plex/components/user/bulk-quota-edit-modal'
import { QuotaEditModal } from '@/features/plex/components/user/quota-edit-modal'
import UserEditModal from '@/features/plex/components/user/user-edit-modal'
import UserTable from '@/features/plex/components/user/user-table'
import { useBulkQuotaManagement } from '@/features/plex/hooks/useBulkQuotaManagement'
import { usePlexBulkUpdate } from '@/features/plex/hooks/usePlexBulkUpdate'
import { usePlexUser } from '@/features/plex/hooks/usePlexUser'
import { useQuotaManagement } from '@/features/plex/hooks/useQuotaManagement'
import type { QuotaFormData } from '@/features/plex/quota/form-schema'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type { PlexUserTableRow } from '@/features/plex/store/types'
import { useApprovalEvents } from '@/hooks/useApprovalEvents'
import { type UserWithQuotaInfo, useConfigStore } from '@/stores/configStore'

/**
 * Displays the Plex Users administration page, allowing administrators to view, edit, and manage user watchlists, individual user settings, quotas, and perform bulk operations.
 *
 * Integrates user and quota management hooks, handles approval event-driven data refresh, and manages modal and loading states for both individual and bulk user and quota editing workflows.
 *
 * @returns The rendered Plex Users administration page component.
 */
export default function PlexUsersPage() {
  const initialize = useConfigStore((state) => state.initialize)
  const refreshQuotaData = useConfigStore((state) => state.refreshQuotaData)

  // Initialize store on mount
  useEffect(() => {
    initialize()
  }, [initialize])

  const {
    selectedUser,
    isEditModalOpen,
    setIsEditModalOpen,
    saveStatus,
    handleEditUser,
    handleUpdateUser,
  } = usePlexUser()

  const {
    bulkEditModalOpen,
    setBulkEditModalOpen,
    updateStatus: bulkUpdateStatus,
    selectedRows,
    handleOpenBulkEditModal,
    handleBulkUpdate,
  } = usePlexBulkUpdate()

  const {
    saveStatus: quotaSaveStatus,
    saveQuota,
    setSaveStatus: setQuotaSaveStatus,
  } = useQuotaManagement()

  const {
    saveStatus: bulkQuotaSaveStatus,
    performBulkOperation,
    setSaveStatus: setBulkQuotaSaveStatus,
  } = useBulkQuotaManagement()

  // Listen for approval events to refresh quota data
  useApprovalEvents({
    onApprovalApproved: () => {
      // Refresh quota data when approvals are processed
      refreshQuotaData()
    },
    onApprovalRejected: () => {
      // Refresh quota data when approvals are rejected
      refreshQuotaData()
    },
    showToasts: false, // Don't show duplicate toasts on this page
  })

  // Quota modal state
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false)
  const [selectedQuotaUser, setSelectedQuotaUser] =
    useState<UserWithQuotaInfo | null>(null)

  // Bulk quota modal state
  const [isBulkQuotaModalOpen, setIsBulkQuotaModalOpen] = useState(false)
  const [selectedQuotaRows, setSelectedQuotaRows] = useState<
    PlexUserTableRow[]
  >([])

  const [isLoading, setIsLoading] = useState(true)
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)
  const isInitialized = useConfigStore((state) => state.isInitialized)
  const usersWithQuota = useConfigStore((state) => state.usersWithQuota)
  const hasUserData = useConfigStore((state) => Boolean(state.users?.length))

  // Setup minimum loading time
  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(() => {
      if (isMounted) {
        setMinLoadingComplete(true)
        if (isInitialized) {
          setIsLoading(false)
        }
      }
    }, MIN_LOADING_DELAY)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [isInitialized])

  // Update loading state when initialized
  useEffect(() => {
    if (isInitialized && minLoadingComplete) {
      setIsLoading(false)
    }
  }, [isInitialized, minLoadingComplete])

  // Quota handlers
  const handleEditQuota = (user: UserWithQuotaInfo) => {
    setSelectedQuotaUser(user)
    setIsQuotaModalOpen(true)
    setQuotaSaveStatus({ type: 'idle' })
  }

  const handleQuotaModalClose = (open: boolean) => {
    if (!open) {
      setIsQuotaModalOpen(false)
      setSelectedQuotaUser(null)
      setQuotaSaveStatus({ type: 'idle' })
    }
  }

  const handleSaveQuota = async (formData: QuotaFormData) => {
    if (!selectedQuotaUser) return

    await saveQuota(selectedQuotaUser, formData, () => {
      setIsQuotaModalOpen(false)
      setSelectedQuotaUser(null)
    })
  }

  // Bulk quota handlers
  const handleOpenBulkQuotaModal = (selectedRows: PlexUserTableRow[]) => {
    setSelectedQuotaRows(selectedRows)
    setIsBulkQuotaModalOpen(true)
    setBulkQuotaSaveStatus({ type: 'idle' })
  }

  const handleBulkQuotaModalClose = (open: boolean) => {
    if (!open) {
      setIsBulkQuotaModalOpen(false)
      setSelectedQuotaRows([])
      setBulkQuotaSaveStatus({ type: 'idle' })
    }
  }

  const handleBulkQuotaSave = async (
    formData: z.input<typeof BulkQuotaFormSchema>,
  ) => {
    await performBulkOperation(selectedQuotaRows, formData, () => {
      setIsBulkQuotaModalOpen(false)
      setSelectedQuotaRows([])
    })
  }

  return (
    <div className="w600:p-[30px] w600:text-lg w400:p-5 w400:text-base p-10 leading-[1.7]">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">User Watchlists</h2>
      </div>
      <div className="grid gap-4">
        {!hasUserData && !isLoading ? (
          <div className="text-center py-8 text-foreground text-muted-foreground">
            No watchlist data available
          </div>
        ) : (
          <>
            <UserTable
              users={usersWithQuota || []}
              onEditUser={handleEditUser}
              onEditQuota={handleEditQuota}
              isLoading={isLoading}
              onBulkEdit={handleOpenBulkEditModal}
              onBulkEditQuotas={handleOpenBulkQuotaModal}
            />
            {/* Individual user edit modal */}
            <UserEditModal
              open={isEditModalOpen}
              onOpenChange={setIsEditModalOpen}
              user={selectedUser}
              onSave={handleUpdateUser}
              saveStatus={saveStatus}
            />
            {/* Quota edit modal */}
            <QuotaEditModal
              isOpen={isQuotaModalOpen}
              onOpenChange={handleQuotaModalClose}
              user={selectedQuotaUser}
              onSave={handleSaveQuota}
              saveStatus={quotaSaveStatus}
            />
            {/* Bulk edit modal */}
            <BulkEditModal
              open={bulkEditModalOpen}
              onOpenChange={setBulkEditModalOpen}
              selectedRows={selectedRows}
              onSave={handleBulkUpdate}
              saveStatus={bulkUpdateStatus}
            />
            {/* Bulk quota edit modal */}
            <BulkQuotaEditModal
              isOpen={isBulkQuotaModalOpen}
              onOpenChange={handleBulkQuotaModalClose}
              selectedRows={selectedQuotaRows}
              onSave={handleBulkQuotaSave}
              saveStatus={bulkQuotaSaveStatus}
            />
          </>
        )}
      </div>
    </div>
  )
}
