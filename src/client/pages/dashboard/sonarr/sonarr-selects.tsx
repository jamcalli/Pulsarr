import type * as React from 'react'
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
  SelectItem,
} from '@/components/ui/select'
import {
  FormControl,
} from '@/components/ui/form'

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
}

export function QualityProfileSelect({
  field,
  isConnectionValid,
  selectedInstance,
  instances,
}: {
  field: SelectFieldProps
} & SelectsProps) {
  const currentInstance = instances.find((i) => i.id === selectedInstance)
  const selectedProfile = currentInstance?.data?.qualityProfiles?.find(
    (p) => p.id.toString() === field.value?.toString(),
  )

  return (
    <Select
      onValueChange={field.onChange}
      value={field.value || ''}
      disabled={!isConnectionValid}
    >
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder="Select quality profile">
            {selectedProfile?.name || 'Select quality profile'}
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

export function RootFolderSelect({
  field,
  isConnectionValid,
  selectedInstance,
  instances,
}: {
  field: SelectFieldProps
} & SelectsProps) {
  const currentInstance = instances.find((i) => i.id === selectedInstance)
  const selectedFolder = currentInstance?.data?.rootFolders?.find(
    (f) => f.path === field.value,
  )

  return (
    <Select
      onValueChange={field.onChange}
      value={field.value || ''}
      disabled={!isConnectionValid}
    >
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder="Select root folder">
            {selectedFolder?.path || 'Select root folder'}
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