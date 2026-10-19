import type { ArrType } from '@/lib/arr/instance-form'

interface InstanceCopy {
  description: string
  emptyTitle: string
  emptyDescription: string
  loadError: string
  apiKeyHelp: string
  urlPlaceholder: string
  namePlaceholder: string
  tagsDescription: string
  syncTargetHint: string
  copyDescription: (source: string, target: string) => string
  lastRemoveDescription: string
  callbackFailed: (address: string) => string
  connectFailed: string
}

export const INSTANCE_COPY: Record<ArrType, InstanceCopy> = {
  radarr: {
    description: 'Where requested movies go.',
    emptyTitle: 'No Radarr instance connected',
    emptyDescription: 'Add a Radarr instance to start sending movies.',
    loadError: "Couldn't load Radarr instances.",
    apiKeyHelp: 'In Radarr, under Settings, General.',
    urlPlaceholder: 'http://192.168.1.20:7878',
    namePlaceholder: 'Radarr 4K',
    tagsDescription: 'Added to every movie Pulsarr sends here.',
    syncTargetHint: 'Add another Radarr instance to sync to it.',
    copyDescription: (source, target) =>
      `Sends every movie already on ${source} to ${target}. New content syncs by itself.`,
    lastRemoveDescription:
      'Your only Radarr instance. Pulsarr deletes everything tied to it:',
    callbackFailed: (address) =>
      `Radarr is reachable, but it can't reach Pulsarr at ${address}.`,
    connectFailed: "Couldn't connect to Radarr",
  },
  sonarr: {
    description: 'Where requested shows go.',
    emptyTitle: 'No Sonarr instance connected',
    emptyDescription: 'Add a Sonarr instance to start sending shows.',
    loadError: "Couldn't load Sonarr instances.",
    apiKeyHelp: 'In Sonarr, under Settings, General.',
    urlPlaceholder: 'http://192.168.1.20:8989',
    namePlaceholder: 'Sonarr 4K',
    tagsDescription: 'Added to every show Pulsarr sends here.',
    syncTargetHint: 'Add another Sonarr instance to sync to it.',
    copyDescription: (source, target) =>
      `Sends every show already on ${source} to ${target}. New content syncs by itself.`,
    lastRemoveDescription:
      'Your only Sonarr instance. Pulsarr deletes everything tied to it:',
    callbackFailed: (address) =>
      `Sonarr is reachable, but it can't reach Pulsarr at ${address}.`,
    connectFailed: "Couldn't connect to Sonarr",
  },
}
