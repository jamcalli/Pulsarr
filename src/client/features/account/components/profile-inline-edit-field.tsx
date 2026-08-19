import { Button } from '@/components/ui/button'
import { FormItem, FormLabel } from '@/components/ui/form'
import { InlineEdit, InlineEditButton } from '@/components/ui/inline-edit'
import { Label } from '@/components/ui/label'

const readOnlyFieldClassName =
  'flex h-10 w-full min-w-0 flex-1 items-center overflow-hidden rounded-base border-2 border-border px-3 py-2 text-sm font-base bg-black/25 text-main-foreground/45 shadow-none'

interface ProfileInlineEditFieldProps {
  label: string
  value: string
  editing: boolean
  editLabel: string
  errorMessage?: string
  disabled?: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onCommit: (value: string) => void
  onStopEditing: () => void
}

export function ProfileInlineEditField({
  label,
  value,
  editing,
  editLabel,
  errorMessage,
  disabled = false,
  onStartEdit,
  onCancelEdit,
  onCommit,
  onStopEditing,
}: ProfileInlineEditFieldProps) {
  if (editing) {
    return (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <div className="flex gap-2">
          <InlineEdit
            value={value}
            onCommit={onCommit}
            editing={editing}
            onEditingChange={(nextEditing) => {
              if (!nextEditing) {
                onStopEditing()
              }
            }}
            editLabel={editLabel}
            disabled={disabled}
            className="mr-0 min-w-0 flex-1"
            inputClassName="min-w-0"
          />
          <Button
            type="button"
            variant="cancel"
            onClick={onCancelEdit}
            disabled={disabled}
            className="h-10 shrink-0"
          >
            Cancel
          </Button>
        </div>
        {errorMessage && (
          <p className="text-sm font-medium text-destructive">{errorMessage}</p>
        )}
      </FormItem>
    )
  }

  return (
    <>
      <Label>{label}</Label>
      <div className="flex gap-2">
        {!disabled && (
          <InlineEditButton
            onClick={onStartEdit}
            editLabel={editLabel}
            className="opacity-100"
          />
        )}
        <div className={readOnlyFieldClassName}>
          <span className="block w-full truncate">{value}</span>
        </div>
      </div>
    </>
  )
}
