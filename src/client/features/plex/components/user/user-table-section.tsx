import { useEffect, useState } from 'react'
import BulkEditModal from '@/features/plex/components/user/bulk-edit-modal'
import { BulkQuotaEditModal } from '@/features/plex/components/user/bulk-quota-edit-modal'
import { QuotaEditModal } from '@/features/plex/components/user/quota-edit-modal'
import UserEditModal from '@/features/plex/components/user/user-edit-modal'
import UserTable from '@/features/plex/components/user/user-table'
import { useBulkQuotaManagement } from '@/features/plex/hooks/useBulkQuotaManagement'
import { usePlexBulkUpdate } from '@/features/plex/hooks/usePlexBulkUpdate'
import { usePlexUser } from '@/features/plex/hooks/usePlexUser'
import { useQuotaManagement } from '@/features/plex/hooks/useQuotaManagement'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'
import type { PlexUserTableRow } from '@/features/plex/store/types'
import { type UserWithQuotaInfo, useConfigStore } from '@/stores/configStore'

/**
 * Renders the user watchlist table section with capabilities for editing users, managing individual and bulk user quotas, and performing bulk user updates.
 *
 * Integrates loading state management, modal dialogs for user and quota editing, and user data from the global store to provide comprehensive user administration.
 */
export default function UserTableSection() {
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

  const handleSaveQuota = async (formData: {
    hasMovieQuota: boolean
    movieQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
    movieQuotaLimit?: number
    movieBypassApproval: boolean
    hasShowQuota: boolean
    showQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
    showQuotaLimit?: number
    showBypassApproval: boolean
  }) => {
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

  const handleBulkQuotaSave = async (formData: {
    clearQuotas: boolean
    setMovieQuota: boolean
    movieQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
    movieQuotaLimit?: number
    movieBypassApproval: boolean
    setShowQuota: boolean
    showQuotaType?: 'daily' | 'weekly_rolling' | 'monthly'
    showQuotaLimit?: number
    showBypassApproval: boolean
  }) => {
    await performBulkOperation(selectedQuotaRows, formData, () => {
      setIsBulkQuotaModalOpen(false)
      setSelectedQuotaRows([])
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">User Watchlists</h2>
      </div>
      <div className="grid gap-4 mt-4">
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
