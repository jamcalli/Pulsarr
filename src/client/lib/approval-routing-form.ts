import { ApprovalRoutingSchema } from '@root/schemas/approval/approval.schema'
import { z } from 'zod'
import type { ArrTarget } from '@/lib/approval'
import type { components } from '@/types/api.js'

type ApprovalRouting = components['schemas']['ApprovalRouting']

export type RoutingFormValues = Required<
  Pick<
    ApprovalRouting,
    | 'tags'
    | 'searchOnAdd'
    | 'seasonMonitoring'
    | 'seriesType'
    | 'minimumAvailability'
    | 'monitor'
  >
> & {
  instanceId: string
  qualityProfile: string
  rootFolder: string
  syncedInstances: string[]
}

const { rootFolder } = ApprovalRoutingSchema.shape

/** Select controls hold ids as strings, so only those fields are restated and the rest are picked. */
export const ApprovalRoutingFormSchema = ApprovalRoutingSchema.pick({
  tags: true,
  searchOnAdd: true,
  seasonMonitoring: true,
  seriesType: true,
  minimumAvailability: true,
  monitor: true,
})
  .required()
  .extend({
    instanceId: z.string(),
    qualityProfile: z.string().min(1, { error: 'Choose a quality profile.' }),
    rootFolder: rootFolder
      .unwrap()
      .unwrap()
      .min(1, { error: 'Choose a root folder.' }),
    syncedInstances: z.array(z.string()),
  })

export function routingFormValues(routing: ApprovalRouting): RoutingFormValues {
  return {
    instanceId: String(routing.instanceId),
    qualityProfile:
      routing.qualityProfile == null ? '' : String(routing.qualityProfile),
    rootFolder: routing.rootFolder ?? '',
    tags: routing.tags ?? [],
    searchOnAdd: routing.searchOnAdd ?? true,
    seasonMonitoring: routing.seasonMonitoring ?? 'all',
    seriesType: routing.seriesType ?? 'standard',
    minimumAvailability: routing.minimumAvailability ?? 'announced',
    monitor: routing.monitor ?? 'movieOnly',
    syncedInstances: (routing.syncedInstances ?? []).map(String),
  }
}

export function routingFromValues(
  values: RoutingFormValues,
  {
    type,
    priority,
    synced,
  }: { type: ArrTarget['type']; priority: number; synced: boolean },
): ApprovalRouting {
  const base = {
    instanceId: Number(values.instanceId),
    instanceType: type,
    qualityProfile: values.qualityProfile,
    rootFolder: values.rootFolder,
    tags: values.tags,
    priority,
    searchOnAdd: values.searchOnAdd,
    syncedInstances: synced ? values.syncedInstances.map(Number) : undefined,
  }
  if (type === 'radarr') {
    return {
      ...base,
      minimumAvailability: values.minimumAvailability,
      monitor: values.monitor,
    }
  }
  return {
    ...base,
    seasonMonitoring: values.seasonMonitoring,
    seriesType: values.seriesType,
  }
}
