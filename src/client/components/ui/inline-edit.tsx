import { Pen } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface InlineEditProps {
  value: string
  onCommit: (value: string) => void
  onEditingChange?: (editing: boolean) => void
  disabled?: boolean
  placeholder?: string
  editLabel?: string
  className?: string
  inputClassName?: string
}

/**
 * Inline pencil-to-input editor for titles. Shows the value with a
 * hover-revealed edit button; editing commits the trimmed value on blur or
 * Enter and reverts on Escape. Empty values never commit.
 *
 * All pointer and key events stop propagation so the editor can sit inside
 * interactive containers (e.g. accordion triggers) without toggling them,
 * and the edit control is a span with role="button" to stay valid HTML when
 * the container itself is a button.
 */
export function InlineEdit({
  value,
  onCommit,
  onEditingChange,
  disabled = false,
  placeholder = 'Unnamed',
  editLabel = 'Edit title',
  className,
  inputClassName,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const setEditingState = (next: boolean) => {
    setEditing(next)
    onEditingChange?.(next)
  }

  const startEditing = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    setDraft(value)
    setEditingState(true)
  }

  const commit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const trimmed = draft.trim()
    if (trimmed) {
      onCommit(trimmed)
      setEditingState(false)
    }
  }

  const cancel = () => {
    setDraft(value)
    setEditingState(false)
  }

  if (editing) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: handlers only stop propagation so parent interactive containers don't react while editing
      <div
        className={cn('mr-4 w-full flex-1', className)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={editLabel}
          autoFocus
          className={cn('w-full', inputClassName)}
          disabled={disabled}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
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
        <span
          role="button"
          tabIndex={0}
          aria-label={editLabel}
          className={cn(
            buttonVariants({ variant: 'noShadow', size: 'icon' }),
            'h-8 w-8 shrink-0 cursor-pointer opacity-0 transition-opacity group-hover/inline-edit:opacity-100 focus-visible:opacity-100',
          )}
          onClick={startEditing}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              startEditing(e)
            }
          }}
        >
          <Pen className="h-4 w-4" />
        </span>
      )}
    </div>
  )
}
