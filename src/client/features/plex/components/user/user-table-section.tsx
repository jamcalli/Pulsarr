import { useEffect, useState } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { usePlexUser } from '@/features/plex/hooks/usePlexUser'
import { usePlexBulkUpdate } from '@/features/plex/hooks/usePlexBulkUpdate'
import UserTable from '@/features/plex/components/user/user-table'
import UserEditModal from '@/features/plex/components/user/user-edit-modal'
import BulkEditModal from '@/features/plex/components/user/bulk-edit-modal'
import { MIN_LOADING_DELAY } from '@/features/plex/store/constants'

export default function UserTableSection() {
  const {
    users,
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

  const [isLoading, setIsLoading] = useState(true)
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)
  const isInitialized = useConfigStore((state) => state.isInitialized)
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text">User Watchlists</h2>
      </div>
      <div className="grid gap-4 mt-4">
        {!hasUserData && !isLoading ? (
          <div className="text-center py-8 text-text text-muted-foreground">
            No watchlist data available
          </div>
        ) : (
          <>
            <UserTable
              users={users || []}
              onEditUser={handleEditUser}
              isLoading={isLoading}
              onBulkEdit={handleOpenBulkEditModal}
            />
            {/* Individual user edit modal */}
            <UserEditModal
              open={isEditModalOpen}
              onOpenChange={setIsEditModalOpen}
              user={selectedUser}
              onSave={handleUpdateUser}
              saveStatus={saveStatus}
            />
            {/* Bulk edit modal */}
            <BulkEditModal
              open={bulkEditModalOpen}
              onOpenChange={setBulkEditModalOpen}
              selectedRows={selectedRows}
              onSave={handleBulkUpdate}
              saveStatus={bulkUpdateStatus}
            />
          </>
        )}
      </div>
    </div>
  )
}
