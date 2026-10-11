import type {
  AppliedRadarrRouting,
  AppliedSonarrRouting,
} from '@root/types/router.types.js'

export function appliedRadarr(
  overrides: Partial<AppliedRadarrRouting> = {},
): AppliedRadarrRouting {
  return {
    instanceId: 1,
    instanceType: 'radarr',
    qualityProfile: 1,
    rootFolder: '/movies',
    tags: [],
    searchOnAdd: true,
    minimumAvailability: 'released',
    monitor: 'movieOnly',
    ...overrides,
  }
}

export function appliedSonarr(
  overrides: Partial<AppliedSonarrRouting> = {},
): AppliedSonarrRouting {
  return {
    instanceId: 1,
    instanceType: 'sonarr',
    qualityProfile: 1,
    rootFolder: '/tv',
    tags: [],
    searchOnAdd: true,
    seasonMonitoring: 'all',
    seriesType: 'standard',
    ...overrides,
  }
}

/** A manager add fake that echoes the requested instance id back in its applied routing. */
export function echoAppliedRadarr(
  overrides: Partial<AppliedRadarrRouting> = {},
) {
  return async (
    _item: unknown,
    _key: string,
    _userId: number,
    instanceId: number,
  ): Promise<AppliedRadarrRouting> =>
    appliedRadarr({ ...overrides, instanceId })
}

export function echoAppliedSonarr(
  overrides: Partial<AppliedSonarrRouting> = {},
) {
  return async (
    _item: unknown,
    _key: string,
    _userId: number,
    instanceId: number,
  ): Promise<AppliedSonarrRouting> =>
    appliedSonarr({ ...overrides, instanceId })
}
