import type { components } from '@/types/api.js'

type Probe = components['schemas']['ArrProbeResponse']

interface ArrOptionLists {
  qualityProfiles: Probe['qualityProfiles'] | undefined
  rootFolders: Probe['rootFolders'] | undefined
  tags: Probe['tags'] | undefined
}

export function toArrOptions({
  qualityProfiles = [],
  rootFolders = [],
  tags = [],
}: ArrOptionLists) {
  return {
    qualityProfiles: qualityProfiles.map((profile) => ({
      value: String(profile.id),
      label: profile.name,
    })),
    rootFolders: rootFolders.map((folder) => ({
      value: folder.path,
      label: folder.path,
    })),
    tags: tags.map((tag) => ({ value: String(tag.id), label: tag.label })),
  }
}
