import type * as React from 'react'
import { FormControl } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { ArrApp } from '@/features/arr/types'
import { useArrInstanceData } from '@/features/arr/useArrInstanceData'

type SelectFieldProps = {
  onChange: (value: string) => void
  value?: string
  ref?: React.Ref<HTMLSelectElement>
}

interface SelectsProps {
  app: ArrApp
  isConnectionValid: boolean
  selectedInstance: number
  disabled?: boolean
}

/**
 * Displays a dropdown for selecting a quality profile from the currently selected instance.
 *
 * Shows a loading skeleton while quality profiles are being fetched. The dropdown is
 * disabled if the connection is invalid or if the `disabled` prop is true.
 */
export function QualityProfileSelect({
  field,
  app,
  isConnectionValid,
  selectedInstance,
  disabled = false,
}: {
  field: SelectFieldProps
} & SelectsProps) {
  const { qualityProfiles, isLoading } = useArrInstanceData(
    app,
    selectedInstance,
    isConnectionValid,
  )
  const selectedProfile = qualityProfiles.find(
    (p) => p.id.toString() === field.value?.toString(),
  )

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />
  }

  return (
    <Select
      onValueChange={field.onChange}
      value={field.value || ''}
      disabled={disabled || !isConnectionValid}
    >
      <FormControl>
        <SelectTrigger className={!field.value ? 'text-muted-foreground' : ''}>
          <SelectValue
            placeholder={
              isConnectionValid
                ? 'Select quality profile'
                : 'Connect instance first'
            }
          >
            {selectedProfile?.name ||
              (isConnectionValid
                ? 'Select quality profile'
                : 'Connect instance first')}
          </SelectValue>
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {qualityProfiles.map((profile) => (
          <SelectItem
            key={profile.id}
            value={profile.id.toString()}
            className="cursor-pointer"
          >
            {profile.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Displays a dropdown for selecting a root folder from the currently selected instance.
 *
 * Shows a loading skeleton while root folders are being fetched. The dropdown is
 * disabled if the connection is invalid or if the `disabled` prop is true.
 */
export function RootFolderSelect({
  field,
  app,
  isConnectionValid,
  selectedInstance,
  disabled = false,
}: {
  field: SelectFieldProps
} & SelectsProps) {
  const { rootFolders, isLoading } = useArrInstanceData(
    app,
    selectedInstance,
    isConnectionValid,
  )
  const selectedFolder = rootFolders.find((f) => f.path === field.value)

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />
  }

  return (
    <Select
      onValueChange={field.onChange}
      value={field.value || ''}
      disabled={disabled || !isConnectionValid}
    >
      <FormControl>
        <SelectTrigger className={!field.value ? 'text-muted-foreground' : ''}>
          <SelectValue
            placeholder={
              isConnectionValid
                ? 'Select root folder'
                : 'Connect instance first'
            }
          >
            {selectedFolder?.path ||
              (isConnectionValid
                ? 'Select root folder'
                : 'Connect instance first')}
          </SelectValue>
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {rootFolders.map((folder) => (
          <SelectItem
            key={folder.path}
            value={folder.path}
            className="cursor-pointer"
          >
            {folder.path}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
