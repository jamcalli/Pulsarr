import { RadarrInstanceSchema } from '@root/schemas/radarr/radarr-instance.schema'
import { SonarrInstanceSchema } from '@root/schemas/sonarr/sonarr-instance.schema'
import type { RoutingFieldValues } from '@/components/routing-fields'
import type { ArrTarget } from '@/lib/approval'
import type { components } from '@/types/api.js'

export type ArrType = ArrTarget['type']

type SonarrCreate = components['schemas']['SonarrInstancePayload']
type RadarrCreate = components['schemas']['RadarrInstancePayload']

export const MONITOR_NEW_ITEMS_LABELS: Record<
  components['schemas']['SonarrMonitorNewItems'],
  string
> = {
  all: 'All',
  none: 'None',
}

/** The open editor: a saved instance, or a new one that saves over the placeholder row when there is one. */
export type EditTarget =
  | { kind: 'saved'; target: ArrTarget }
  | { kind: 'new'; first: boolean; placeholderId: number | null }

type StoredRoutingField =
  | 'searchOnAdd'
  | 'seasonMonitoring'
  | 'seriesType'
  | 'monitor'

export type InstanceRoutingValues = Omit<
  RoutingFieldValues,
  'qualityProfile' | 'rootFolder' | 'minimumAvailability' | StoredRoutingField
> & {
  [Field in StoredRoutingField]: NonNullable<RoutingFieldValues[Field]>
} & {
  qualityProfile: string
  rootFolder: string
  minimumAvailability: components['schemas']['RadarrMinimumAvailability']
}

/** Both types' fields are present so one form serves either, a type ignores the other's on save. */
export interface InstanceFormValues {
  name: string
  baseUrl: string
  apiKey: string
  routing: InstanceRoutingValues
  monitorNewItems: components['schemas']['SonarrMonitorNewItems']
  createSeasonFolders: boolean
  isDefault: boolean
  bypassIgnored: boolean
  syncedInstances: string[]
  skipDefaultRoutingWhenNoMatch: boolean
}

const SONARR_DEFAULTS = SonarrInstanceSchema.pick({
  bypassIgnored: true,
  seasonMonitoring: true,
  monitorNewItems: true,
  searchOnAdd: true,
  createSeasonFolders: true,
  tags: true,
  seriesType: true,
  skipDefaultRoutingWhenNoMatch: true,
}).parse({})

const RADARR_DEFAULTS = RadarrInstanceSchema.pick({
  minimumAvailability: true,
  monitor: true,
}).parse({})

function blankValues(isDefault: boolean): InstanceFormValues {
  return {
    name: '',
    baseUrl: '',
    apiKey: '',
    routing: {
      instanceId: '',
      qualityProfile: '',
      rootFolder: '',
      tags: SONARR_DEFAULTS.tags,
      searchOnAdd: SONARR_DEFAULTS.searchOnAdd,
      seasonMonitoring: SONARR_DEFAULTS.seasonMonitoring,
      seriesType: SONARR_DEFAULTS.seriesType,
      minimumAvailability: RADARR_DEFAULTS.minimumAvailability,
      monitor: RADARR_DEFAULTS.monitor,
    },
    monitorNewItems: SONARR_DEFAULTS.monitorNewItems,
    createSeasonFolders: SONARR_DEFAULTS.createSeasonFolders,
    isDefault,
    bypassIgnored: SONARR_DEFAULTS.bypassIgnored,
    syncedInstances: [],
    skipDefaultRoutingWhenNoMatch:
      SONARR_DEFAULTS.skipDefaultRoutingWhenNoMatch,
  }
}

function savedValues({ type, instance }: ArrTarget): InstanceFormValues {
  const blank = blankValues(instance.isDefault)
  const shared: InstanceFormValues = {
    ...blank,
    name: instance.name,
    baseUrl: instance.baseUrl,
    apiKey: instance.apiKey,
    routing: {
      ...blank.routing,
      qualityProfile:
        instance.qualityProfile == null ? '' : String(instance.qualityProfile),
      rootFolder: instance.rootFolder ?? '',
      tags: instance.tags,
      searchOnAdd: instance.searchOnAdd,
    },
    bypassIgnored: instance.bypassIgnored,
    syncedInstances: (instance.syncedInstances ?? []).map(String),
    skipDefaultRoutingWhenNoMatch: instance.skipDefaultRoutingWhenNoMatch,
  }
  if (type === 'radarr') {
    return {
      ...shared,
      routing: {
        ...shared.routing,
        minimumAvailability: instance.minimumAvailability,
        monitor: instance.monitor,
      },
    }
  }
  return {
    ...shared,
    routing: {
      ...shared.routing,
      seasonMonitoring: instance.seasonMonitoring,
      seriesType: instance.seriesType,
    },
    monitorNewItems: instance.monitorNewItems,
    createSeasonFolders: instance.createSeasonFolders,
  }
}

export function editValues(edit: EditTarget | null): InstanceFormValues {
  if (edit === null) return blankValues(false)
  return edit.kind === 'saved'
    ? savedValues(edit.target)
    : blankValues(edit.first)
}

/** True when a saved instance has no quality profile or root folder. */
export function needsSetup({ instance }: ArrTarget): boolean {
  return (
    instance.qualityProfile == null ||
    instance.qualityProfile === '' ||
    !instance.rootFolder
  )
}

function sharedBody(values: InstanceFormValues) {
  return {
    name: values.name,
    baseUrl: values.baseUrl,
    apiKey: values.apiKey,
    qualityProfile: values.routing.qualityProfile,
    rootFolder: values.routing.rootFolder,
    tags: values.routing.tags,
    searchOnAdd: values.routing.searchOnAdd,
    bypassIgnored: values.bypassIgnored,
    isDefault: values.isDefault,
    syncedInstances: values.syncedInstances.map(Number),
    skipDefaultRoutingWhenNoMatch: values.skipDefaultRoutingWhenNoMatch,
  }
}

export function radarrBody(values: InstanceFormValues): RadarrCreate {
  return {
    ...sharedBody(values),
    minimumAvailability: values.routing.minimumAvailability,
    monitor: values.routing.monitor,
  }
}

export function sonarrBody(values: InstanceFormValues): SonarrCreate {
  return {
    ...sharedBody(values),
    seasonMonitoring: values.routing.seasonMonitoring,
    seriesType: values.routing.seriesType,
    monitorNewItems: values.monitorNewItems,
    createSeasonFolders: values.createSeasonFolders,
  }
}
