import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useConfigStore } from '@/stores/configStore'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface UserEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: {
    id: string
    name: string
    email: string
    alias: string | null
    discord_id: string | null
    notify_email: boolean
    notify_discord: boolean
  } | null
}

export function UserEditModal({
  open,
  onOpenChange,
  user,
}: UserEditModalProps) {
  const { toast } = useToast()
  const fetchUserData = useConfigStore((state) => state.fetchUserData)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Form state
  const [formData, setFormData] = React.useState({
    name: '',
    email: '',
    alias: '',
    discord_id: '',
    notify_email: false,
    notify_discord: false,
  })

  // Update form data when user prop changes
  React.useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        alias: user.alias || '',
        discord_id: user.discord_id || '',
        notify_email: user.notify_email,
        notify_discord: user.notify_discord,
      })
    }
  }, [user])

  const handleSubmit = async () => {
    if (!user) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`/v1/users/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        throw new Error('Failed to update user')
      }

      // Refresh user data
      await fetchUserData()

      toast({
        description: 'User information updated successfully',
        variant: 'default',
      })

      onOpenChange(false)
    } catch (error) {
      console.error('Update error:', error)
      toast({
        description:
          error instanceof Error ? error.message : 'Failed to update user',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Prevent closing during submission
  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      onOpenChange(newOpen)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (isSubmitting) {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isSubmitting) {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-text">Edit User Information</DialogTitle>
          <DialogDescription>
            Update user details and notification preferences
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="User name"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="Email address"
                type="email"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="alias">Alias</Label>
              <Input
                id="alias"
                value={formData.alias}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, alias: e.target.value }))
                }
                placeholder="User alias (optional)"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discord">Discord ID</Label>
              <Input
                id="discord"
                value={formData.discord_id}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    discord_id: e.target.value,
                  }))
                }
                placeholder="Discord ID (optional)"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="notify-email" className="flex-grow">
                  Email Notifications
                </Label>
                <Switch
                  id="notify-email"
                  checked={formData.notify_email}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, notify_email: checked }))
                  }
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="notify-discord" className="flex-grow">
                  Discord Notifications
                </Label>
                <Switch
                  id="notify-discord"
                  checked={formData.notify_discord}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      notify_discord: checked,
                    }))
                  }
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="noShadow"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default UserEditModal
