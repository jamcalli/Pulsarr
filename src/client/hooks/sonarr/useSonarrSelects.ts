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

export function useQualityProfileSelect({
    field,
    isConnectionValid,
    selectedInstance,
    instances,
  }: {
    field: SelectFieldProps
  } & SelectsProps) {
    const currentInstance = instances.find((i) => i.id === selectedInstance)
    const selectedProfile = currentInstance?.data?.qualityProfiles?.find(
      (p) => p.id.toString() === field.value?.toString()
    )
  
    const profiles = currentInstance?.data?.qualityProfiles || []
  
    return {
      selectedProfile,
      profiles,
      placeholder: isConnectionValid ? 'Select quality profile' : 'Connect instance first'
    }
  }
  
  export function useRootFolderSelect({
    field,
    isConnectionValid,
    selectedInstance,
    instances,
  }: {
    field: SelectFieldProps
  } & SelectsProps) {
    const currentInstance = instances.find((i) => i.id === selectedInstance)
    const selectedFolder = currentInstance?.data?.rootFolders?.find(
      (f) => f.path === field.value
    )
  
    const folders = currentInstance?.data?.rootFolders || []
  
    return {
      selectedFolder,
      folders,
      placeholder: isConnectionValid ? 'Select root folder' : 'Connect instance first'
    }
  }