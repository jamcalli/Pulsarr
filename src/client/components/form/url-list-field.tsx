import { splitUrlList } from '@root/schemas/common/url-list'
import { X } from 'lucide-react'
import { useState } from 'react'
import { BusyLabel } from '@/components/busy-label'
import { ConnectionTest } from '@/components/connection-test'
import { ActionResults } from '@/components/settings/action-results'
import { LockLine } from '@/components/settings/lock-line'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useSendTest } from '@/hooks/useSendTest'
import { useFieldContext } from '@/lib/form-context'
import { UNSAVED_CHANGES_REASON } from '@/lib/settings'
import type { components } from '@/types/api.js'

type TestResult = components['schemas']['TestResult']

const MAX_ROWS = 5

interface Row {
  id: number
  url: string
}

let lastRowId = 0

function newRow(url: string): Row {
  lastRowId += 1
  return { id: lastRowId, url }
}

function joinRows(rows: readonly Row[]): string {
  return splitUrlList(rows.map((row) => row.url).join(',')).join(',')
}

/** Rows whose URL survives keep their id, so their test results stay. */
function toRows(value: string, previous: readonly Row[]): Row[] {
  const urls = splitUrlList(value)
  if (urls.length === 0) return [newRow('')]
  const unused = [...previous]
  return urls.map((url) => {
    const match = unused.findIndex((row) => row.url.trim() === url)
    if (match === -1) return newRow(url)
    const [kept] = unused.splice(match, 1)
    return { id: kept.id, url }
  })
}

function sameList(a: string, b: string): boolean {
  return splitUrlList(a).join(',') === splitUrlList(b).join(',')
}

interface UrlRowProps {
  name: string
  label: string
  position: number
  url: string
  placeholder?: string
  disabled: boolean
  validateRow: (url: string) => string | null
  testUrl: (url: string) => Promise<TestResult>
  onChange: (url: string) => void
  onBlur: () => void
  onRemove: () => void
}

function UrlRow({
  name,
  label,
  position,
  url,
  placeholder,
  disabled,
  validateRow,
  testUrl,
  onChange,
  onBlur,
  onRemove,
}: UrlRowProps) {
  const [blurred, setBlurred] = useState(false)
  const value = url.trim()
  const test = useSendTest(testUrl, value)
  const formatError = value === '' ? null : validateRow(value)
  const shownError = blurred ? formatError : null
  const errorId = `${name}-${position}-error`
  const canTest =
    !disabled && value !== '' && formatError === null && !test.testing

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`${label}, URL ${position}`}
          value={url}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="min-w-0 flex-1 truncate"
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            setBlurred(true)
            onBlur()
          }}
          aria-invalid={shownError !== null}
          aria-describedby={shownError ? errorId : undefined}
        />
        <Button
          type="button"
          variant="neutral"
          disabled={!canTest}
          onClick={() => test.run(value)}
        >
          <BusyLabel
            busy={test.testing}
            label="Send test"
            busyLabel="Sending..."
          />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove URL ${position}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
      {shownError && (
        <FieldError id={errorId} errors={[{ message: shownError }]} />
      )}
      <ConnectionTest
        size="inline"
        testing={test.testing}
        outcome={test.outcome}
      />
    </div>
  )
}

interface UrlListFieldProps {
  label: string
  description?: string
  disabled?: boolean
  placeholder?: string
  /** The saved list, which the saved test sends to. */
  saved: string
  /** The row's format error, or null when the row may be tested and saved. */
  validateRow: (url: string) => string | null
  testUrl: (url: string) => Promise<TestResult>
  testSaved: () => Promise<TestResult>
}

export function UrlListField({
  label,
  description,
  disabled = false,
  placeholder,
  saved,
  validateRow,
  testUrl,
  testSaved,
}: UrlListFieldProps) {
  const field = useFieldContext<string>()
  const value = field.state.value
  const [list, setList] = useState(() => ({ value, rows: toRows(value, []) }))
  const savedTest = useSendTest(testSaved, saved)

  let rows = list.rows
  if (list.value !== value) {
    rows = toRows(value, list.rows)
    setList({ value, rows })
  }

  const change = (next: Row[]) => {
    const nextValue = joinRows(next)
    setList({ value: nextValue, rows: next })
    if (nextValue !== value) field.handleChange(nextValue)
  }

  const atCap = rows.length >= MAX_ROWS
  const savedReason = !sameList(value, saved)
    ? UNSAVED_CHANGES_REASON
    : splitUrlList(saved).length === 0
      ? 'Nothing saved yet.'
      : null
  const labelId = `${field.name}-label`

  return (
    <Field
      orientation="vertical"
      data-disabled={disabled}
      aria-labelledby={labelId}
      className="gap-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <FieldContent className="min-w-60 flex-1">
          <FieldTitle id={labelId}>{label}</FieldTitle>
          {description && <FieldDescription>{description}</FieldDescription>}
        </FieldContent>
        <div className="flex flex-col items-start gap-1 md:items-end">
          <Button
            type="button"
            variant="neutral"
            size="sm"
            disabled={disabled || savedReason !== null || savedTest.testing}
            onClick={() => savedTest.run(saved)}
          >
            <BusyLabel
              busy={savedTest.testing}
              label="Test saved URLs"
              busyLabel="Testing..."
            />
          </Button>
          {savedReason && <LockLine reason={savedReason} />}
        </div>
      </div>
      {rows.map((row, index) => (
        <UrlRow
          key={row.id}
          name={field.name}
          label={label}
          position={index + 1}
          url={row.url}
          placeholder={placeholder}
          disabled={disabled}
          validateRow={validateRow}
          testUrl={testUrl}
          onChange={(url) =>
            change(rows.map((r) => (r.id === row.id ? { ...r, url } : r)))
          }
          onBlur={field.handleBlur}
          onRemove={() => {
            const rest = rows.filter((r) => r.id !== row.id)
            change(rest.length === 0 ? [newRow('')] : rest)
          }}
        />
      ))}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || atCap}
          onClick={() => change([...rows, newRow('')])}
        >
          Add URL
        </Button>
        {atCap && <FieldDescription>Up to {MAX_ROWS} URLs.</FieldDescription>}
      </div>
      {!savedTest.testing && savedTest.outcome && savedTest.ranAt && (
        <ActionResults ranAt={savedTest.ranAt}>
          <ConnectionTest
            size="inline"
            testing={false}
            outcome={savedTest.outcome}
          />
        </ActionResults>
      )}
    </Field>
  )
}
