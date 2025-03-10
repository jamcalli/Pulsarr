import { useEffect, useState } from 'react'
import { useConfigStore } from '@/stores/configStore'
import { usePlexUser } from '../../hooks/usePlexUser'
import UserTable from './user-table'
import UserEditModal from './user-edit-modal'
import UserTableSkeleton from './user-table-skeleton'
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
  
  const [isLoading, setIsLoading] = useState(true)
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)
  const isInitialized = useConfigStore((state) => state.isInitialized)
  const hasUserData = useConfigStore((state) => Boolean(state.users?.length))

  // Setup minimum loading time
  useEffect(() => {
    let isMounted = true;
    
    const timer = setTimeout(() => {
      if (isMounted) {
        setMinLoadingComplete(true);
        if (isInitialized) {
          setIsLoading(false);
        }
      }
    }, MIN_LOADING_DELAY);
    
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isInitialized]);
  
  // Update loading state when initialized
  useEffect(() => {
    if (isInitialized && minLoadingComplete) {
      setIsLoading(false);
    }
  }, [isInitialized, minLoadingComplete]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text">User Watchlists</h2>
      </div>
      <div className="grid gap-4 mt-4">
        {isLoading ? (
          <UserTableSkeleton />
        ) : users && users.length > 0 ? (
          <>
            <UserTable users={users} onEditUser={handleEditUser} />
            <UserEditModal
              open={isEditModalOpen}
              onOpenChange={setIsEditModalOpen}
              user={selectedUser}
              onSave={handleUpdateUser}
              saveStatus={saveStatus}
            />
          </>
        ) : (
          <div className="text-center py-8 text-text text-muted-foreground">
            No watchlist data available
          </div>
        )}
      </div>
    </div>
  )
}