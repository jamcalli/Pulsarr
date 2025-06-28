import type * as React from 'react'
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
  SelectItem,
} from '@/components/ui/select'
import { FormControl } from '@/components/ui/form'
import { Skeleton } from '@/components/ui/skeleton'

type SelectFieldProps = {
  onChange: (value: string) => void
  value?: string
  ref?: React.Ref<HTMLSelectElement>
}

interface SelectsProps {
  isConnectionValid: boolean
  selectedInstance: number
  instances: Array<{
    id: number
    data?: {
      qualityProfiles?: Array<{ id: number; name: string }>
      rootFolders?: Array<{ path: string }>
    }
  }>
  disabled?: boolean
}

/**
 * Displays a dropdown for selecting a quality profile from the currently selected instance.
 *
 * Shows a loading skeleton if quality profiles are not loaded. The dropdown is disabled if the connection is invalid or if the `disabled` prop is true, and lists all available quality profiles for the selected instance.
 */
export function QualityProfileSelect({
  field,
  isConnectionValid,
  selectedInstance,
  instances,
  disabled = false,
}: {
  field: SelectFieldProps
} & SelectsProps) {
  const currentInstance = instances.find((i) => i.id === selectedInstance)
  const selectedProfile = currentInstance?.data?.qualityProfiles?.find(
    (p) => p.id.toString() === field.value?.toString(),
  )

  const isLoading = currentInstance && !currentInstance?.data?.qualityProfiles

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
        {currentInstance?.data?.qualityProfiles?.map((profile) => (
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
 * Renders a dropdown select input for choosing a root folder from the currently selected instance.
 *
 * Shows a loading skeleton if root folder data is unavailable. The select input is disabled if the connection is invalid or if the `disabled` prop is true.
 *
 * @param disabled - If true, disables the select input regardless of connection status
 */
export function RootFolderSelect({
  field,
  isConnectionValid,
  selectedInstance,
  instances,
  disabled = false,
}: {
  field: SelectFieldProps
} & SelectsProps) {
  const currentInstance = instances.find((i) => i.id === selectedInstance)
  const selectedFolder = currentInstance?.data?.rootFolders?.find(
    (f) => f.path === field.value,
  )

  const isLoading = currentInstance && !currentInstance?.data?.rootFolders

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
        {currentInstance?.data?.rootFolders?.map((folder) => (
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
