import {
  Credenza,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaDescription,
  CredenzaBody,
  CredenzaFooter,
  CredenzaClose,
} from '@/components/ui/credenza'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'

interface UserTagsDeleteConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (deleteTagDefinitions: boolean) => Promise<void>
  isSubmitting?: boolean
}

/**
 * Renders a confirmation modal for removing user tags.
 *
 * This modal displays a warning message to confirm the user's intention to remove all user tags
 * from media items in Sonarr and Radarr instances. It provides an option to also delete the tag
 * definitions themselves, and buttons to either proceed with the removal or cancel the operation.
 *
 * @param open - Controls whether the modal is visible.
 * @param onOpenChange - Callback to update the modal's open state.
 * @param onConfirm - Callback invoked when the user confirms the deletion.
 * @param isSubmitting - Optional flag that, when true, disables the confirm button during submission.
 */
export function UserTagsDeleteConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting = false,
}: UserTagsDeleteConfirmationModalProps) {
  const [deleteTagDefinitions, setDeleteTagDefinitions] = useState(false)

  const handleConfirm = () => {
    onConfirm(deleteTagDefinitions)
    onOpenChange(false)
  }

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-text flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Remove User Tags?
          </CredenzaTitle>
          <CredenzaDescription>
            This will remove all user tags from content in your Sonarr and
            Radarr instances.
          </CredenzaDescription>
        </CredenzaHeader>
        <CredenzaBody>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-md mb-4">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              User tags will be removed from all media items. This won't affect
              the content itself, only the user tag associations.
            </p>
          </div>

          <div className="flex items-center space-x-2 mt-4">
            <Checkbox
              id="delete-definitions"
              checked={deleteTagDefinitions}
              onCheckedChange={(checked) => setDeleteTagDefinitions(!!checked)}
            />
            <label
              htmlFor="delete-definitions"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Also delete tag definitions
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-6">
            When enabled, this will also remove the user tag definitions from
            your Sonarr and Radarr instances, not just remove them from media.
          </p>

          <CredenzaFooter className="mt-6">
            <CredenzaClose asChild>
              <Button variant="neutral">Cancel</Button>
            </CredenzaClose>
            <Button
              variant="clear"
              onClick={handleConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Remove Tags'}
            </Button>
          </CredenzaFooter>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  )
}

export default UserTagsDeleteConfirmationModal
