import { useId, useState } from 'react'
import { ConfirmCredenza } from '@/components/confirm-credenza'
import { SwitchRow } from '@/components/form/switch-row'

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
  const switchId = useId()
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
      <SwitchRow
        id={switchId}
        label="Also delete the tag definitions"
        description="Removes the tags themselves from Radarr and Sonarr, not just from content. Required before you can change the tag format."
        checked={deleteDefinitions}
        onCheckedChange={setDeleteDefinitions}
      />
    </ConfirmCredenza>
  )
}
