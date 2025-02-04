import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormControl } from '@/components/ui/form'

interface SelectFieldProps {
  onChange: (value: string) => void
  value?: string
  ref: React.Ref<HTMLSelectElement>
}

interface SonarrInstance {
  id: number
  data?: {
    rootFolders?: {
      path: string
    }[]
    qualityProfiles?: {
      id: number
      name: string
    }[]
  }
}

interface SelectProps {
  field: SelectFieldProps
  instanceId: number
  instances: SonarrInstance[]
  isConnectionValid: boolean
}

export const QualityProfileSelect = ({
  field,
  instanceId,
  instances,
  isConnectionValid,
}: SelectProps) => (
  <Select
    onValueChange={field.onChange}
    value={field.value || ''}
    disabled={!isConnectionValid}
  >
    <FormControl>
      <SelectTrigger>
        <SelectValue placeholder="Select quality profile">
          {field.value
            ? (() => {
                const instance = instances.find((i) => i.id === instanceId)
                const profile = instance?.data?.qualityProfiles?.find(
                  (p) => p.id.toString() === field.value?.toString(),
                )
                return profile?.name || 'Select quality profile'
              })()
            : 'Select quality profile'}
        </SelectValue>
      </SelectTrigger>
    </FormControl>
    <SelectContent>
      {instances
        .find((i) => i.id === instanceId)
        ?.data?.qualityProfiles?.map((profile) => (
          <SelectItem key={profile.id} value={profile.id.toString()}>
            {profile.name}
          </SelectItem>
        ))}
    </SelectContent>
  </Select>
)

export const RootFolderSelect = ({
  field,
  instanceId,
  instances,
  isConnectionValid,
}: SelectProps) => (
  <Select
    onValueChange={field.onChange}
    value={field.value || ''}
    disabled={!isConnectionValid}
  >
    <FormControl>
      <SelectTrigger>
        <SelectValue placeholder="Select root folder">
          {field.value
            ? (() => {
                const instance = instances.find((i) => i.id === instanceId)
                const folder = instance?.data?.rootFolders?.find(
                  (f) => f.path === field.value,
                )
                return folder?.path || 'Select root folder'
              })()
            : 'Select root folder'}
        </SelectValue>
      </SelectTrigger>
    </FormControl>
    <SelectContent>
      {instances
        .find((i) => i.id === instanceId)
        ?.data?.rootFolders?.map((folder) => (
          <SelectItem key={folder.path} value={folder.path}>
            {folder.path}
          </SelectItem>
        ))}
    </SelectContent>
  </Select>
)