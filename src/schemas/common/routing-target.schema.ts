import {
  RadarrMinimumAvailabilitySchema,
  RadarrMonitorSchema,
} from '@root/schemas/radarr/add-options.schema.js'
import { SonarrSeasonMonitoringValueSchema } from '@root/schemas/sonarr/season-monitoring.schema.js'
import { SonarrSeriesTypeSchema } from '@root/schemas/sonarr/series-type.schema.js'
import { z } from 'zod'

const QUALITY_PROFILE_ERROR = 'Quality profile must be a positive whole number.'

/** Null means use the instance's quality profile at routing time. */
export const RoutingQualityProfileInputSchema = z
  .union([z.number(), z.string().regex(/^\d+$/).transform(Number)], {
    error: QUALITY_PROFILE_ERROR,
  })
  .pipe(
    z
      .number()
      .int({ error: QUALITY_PROFILE_ERROR })
      .positive({ error: QUALITY_PROFILE_ERROR }),
  )
  .nullable()

/** Carries ids and the numeric strings older approval records hold. */
export const RoutingQualityProfileSchema = z
  .union([z.number(), z.string()])
  .nullable()

/** Null means use the instance's root folder at routing time. */
export const RoutingRootFolderInputSchema = z
  .string()
  .min(1, { error: 'Root folder cannot be empty.' })
  .nullable()

export const RoutingRootFolderSchema = z.string().nullable()

/** Empty applies the instance's tags, a non-empty list replaces them. */
export const RoutingTagsSchema = z.array(z.string())

export const RoutingSearchOnAddSchema = z.boolean().nullable()
export const RoutingSeasonMonitoringSchema =
  SonarrSeasonMonitoringValueSchema.nullable()
export const RoutingSeriesTypeSchema = SonarrSeriesTypeSchema.nullable()
export const RoutingMonitorSchema = RadarrMonitorSchema.nullable()
export const RoutingMinimumAvailabilitySchema =
  RadarrMinimumAvailabilitySchema.nullable()
