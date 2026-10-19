import { RadarrInstanceFieldsSchema } from '@root/schemas/radarr/radarr-instance.schema'
import {
  SonarrInstanceFieldsSchema,
  SonarrMonitorNewItemsSchema,
} from '@root/schemas/sonarr/sonarr-instance.schema'
import { z } from 'zod'
import { ApprovalRoutingFormSchema } from '@/lib/approval-routing-form'

const sonarr = SonarrInstanceFieldsSchema.shape
const radarr = RadarrInstanceFieldsSchema.shape
const { qualityProfile, rootFolder } = ApprovalRoutingFormSchema.shape

export const InstanceFormSchema = z.object({
  name: sonarr.name,
  baseUrl: sonarr.baseUrl,
  apiKey: sonarr.apiKey,
  routing: z.object({
    instanceId: z.string(),
    qualityProfile,
    rootFolder,
    tags: sonarr.tags,
    searchOnAdd: sonarr.searchOnAdd,
    seasonMonitoring: sonarr.seasonMonitoring,
    seriesType: sonarr.seriesType,
    minimumAvailability: radarr.minimumAvailability,
    monitor: radarr.monitor,
  }),
  monitorNewItems: SonarrMonitorNewItemsSchema,
  createSeasonFolders: sonarr.createSeasonFolders,
  isDefault: sonarr.isDefault,
  bypassIgnored: sonarr.bypassIgnored,
  syncedInstances: z.array(z.string()),
  skipDefaultRoutingWhenNoMatch: sonarr.skipDefaultRoutingWhenNoMatch,
})

export const InstanceEditorSchema = z.object({ instance: InstanceFormSchema })
