import { useId, useState } from 'react'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field'

interface RemoveTagsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (deleteDefinitions: boolean) => void
  defaultDeleteDefinitions?: boolean
}

export function RemoveTagsDialog({
  open,
  onOpenChange,
  onConfirm,
  defaultDeleteDefinitions = false,
}: RemoveTagsDialogProps) {
  const checkboxId = useId()
  const [deleteDefinitions, setDeleteDefinitions] = useState(
    defaultDeleteDefinitions,
  )

  const handleOpenChange = (next: boolean) => {
    if (!next) setDeleteDefinitions(defaultDeleteDefinitions)
    onOpenChange(next)
  }

  return (
    <ConfirmCredenza
      open={open}
      onOpenChange={handleOpenChange}
      title="Remove all user tags?"
      description="Strips every user tag from movies and shows in your Radarr and Sonarr instances. Your content isn't touched."
      confirmLabel="Remove tags"
      confirmVariant="destructive"
      onConfirm={() => {
        onConfirm(deleteDefinitions)
        handleOpenChange(false)
      }}
    >
      <Field orientation="horizontal">
        <Checkbox
          id={checkboxId}
          checked={deleteDefinitions}
          onCheckedChange={setDeleteDefinitions}
        />
        <FieldContent>
          <FieldLabel htmlFor={checkboxId}>
            Also delete the tag definitions
          </FieldLabel>
          <FieldDescription>
            Removes the tags themselves from Radarr and Sonarr, not just from
            content. Required before you can change the tag format.
          </FieldDescription>
        </FieldContent>
      </Field>
    </ConfirmCredenza>
  )
}
