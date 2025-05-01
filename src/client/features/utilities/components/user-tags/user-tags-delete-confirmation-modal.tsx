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
 * Displays a modal dialog to confirm removal of all user tags from media items.
 *
 * Provides an option to also delete the tag definitions themselves, and allows the user to confirm or cancel the operation.
 *
 * @param open - Whether the modal is visible.
 * @param onOpenChange - Invoked to update the modal's open state.
 * @param onConfirm - Called with a boolean indicating whether to delete tag definitions when the user confirms.
 * @param isSubmitting - Optional; disables the confirm button and shows a processing state when true.
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
              className="text-sm font-medium text-text leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Also delete tag definitions
            </label>
          </div>
          <p className="text-xs text-text mt-1 ml-6">
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
