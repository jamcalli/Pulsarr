import { Pen } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface InlineEditButtonProps {
  onClick: (e: React.MouseEvent) => void
  editLabel?: string
  className?: string
}

/**
 * Standalone pencil affordance - controls must not nest inside a native
 * button, so containers like accordion triggers render this as a sibling.
 */
export function InlineEditButton({
  onClick,
  editLabel = 'Edit title',
  className,
}: InlineEditButtonProps) {
  return (
    <Button
      type="button"
      variant="noShadow"
      size="icon"
      aria-label={editLabel}
      className={cn(
        'h-8 w-8 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100',
        className,
      )}
      onClick={onClick}
    >
      <Pen className="h-4 w-4" />
    </Button>
  )
}

interface InlineEditProps {
  value: string
  onCommit: (value: string) => void
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  disabled?: boolean
  placeholder?: string
  editLabel?: string
  className?: string
  inputClassName?: string
}

/**
 * Inline pencil-to-input editor for titles. Commits the trimmed value on
 * blur or Enter, reverts on Escape; empty or unchanged drafts close without
 * committing. Editing state is internal unless controlled via `editing`.
 */
export function InlineEdit({
  value,
  onCommit,
  editing: controlledEditing,
  onEditingChange,
  disabled = false,
  placeholder = 'Unnamed',
  editLabel = 'Edit title',
  className,
  inputClassName,
}: InlineEditProps) {
  const [internalEditing, setInternalEditing] = useState(false)
  const editing = controlledEditing ?? internalEditing
  // seed from value so a controlled remount mid-edit keeps the draft
  const [draft, setDraft] = useState(() => (controlledEditing ? value : ''))

  // re-seed when a controlled parent turns editing on without a remount
  const [prevEditing, setPrevEditing] = useState(editing)
  if (editing !== prevEditing) {
    setPrevEditing(editing)
    if (editing) {
      setDraft(value)
    }
  }

  const setEditingState = (next: boolean) => {
    if (controlledEditing === undefined) {
      setInternalEditing(next)
    }
    onEditingChange?.(next)
  }

  const startEditing = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    setDraft(value)
    setEditingState(true)
  }

  const commit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) {
      cancel()
      return
    }
    if (trimmed !== value) {
      onCommit(trimmed)
    }
    setEditingState(false)
  }

  const cancel = () => {
    setDraft(value)
    setEditingState(false)
  }

  if (editing) {
    return (
      <div className={cn('mr-4 w-full flex-1', className)}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={editLabel}
          autoFocus
          className={cn('w-full', inputClassName)}
          disabled={disabled}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit(e)
            } else if (e.key === 'Escape') {
              cancel()
            }
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group/inline-edit flex min-w-0 flex-1 items-center gap-2',
        className,
      )}
    >
      <span className="truncate">{value || placeholder}</span>
      {!disabled && (
        <InlineEditButton
          onClick={startEditing}
          editLabel={editLabel}
          className="group-hover/inline-edit:opacity-100"
        />
      )}
    </div>
  )
}
