import React from 'react'
import { usePlexUser } from '../../hooks/usePlexUser'
import UserTable from './user-table'
import UserEditModal from './user-edit-modal'

export default function UserTableSection() {
  const {
    users,
    selectedUser,
    isEditModalOpen,
    setIsEditModalOpen,
    saveStatus,
    handleEditUser,
    handleUpdateUser
  } = usePlexUser()

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text">User Watchlists</h2>
      </div>
      <div className="grid gap-4 mt-4">
        {users ? (
          <>
            <UserTable 
              users={users} 
              onEditUser={handleEditUser}
            />
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