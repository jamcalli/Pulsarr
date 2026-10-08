import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import {
  type FallbackTarget,
  routeDestination,
} from '@/features/library/lib/content-router/route-list'
import { useArrInstances } from '@/hooks/useArrInstances'
import { useQualityProfileNames } from '@/hooks/useQualityProfileNames'

const INSTANCE_DEFAULT = 'Instance default'

interface TargetFields {
  exclude: boolean
  instanceId: number | null
  /** Null inherits the instance's value. */
  qualityProfile: string | number | null
  rootFolder: string | null
}

export function useRouteTargets(type: RouteType, instanceIds: number[]) {
  const instances = useArrInstances(type)
  const { profileName } = useQualityProfileNames(type, instanceIds)

  const defaultTarget = instances.configuredDefault
  const fallback: FallbackTarget | null = defaultTarget
    ? {
        name: defaultTarget.instance.name,
        skipsUnmatched: defaultTarget.instance.skipDefaultRoutingWhenNoMatch,
      }
    : null

  return {
    instances,
    fallback,
    hasInstance: instances.configuredTargets.length > 0,
    destination: ({
      exclude,
      instanceId,
      qualityProfile,
      rootFolder,
    }: TargetFields) => {
      const instance =
        instanceId === null
          ? null
          : (instances.findTarget(instanceId)?.instance ?? null)
      if (instance === null) {
        return routeDestination(type, {
          exclude,
          instanceName: null,
          qualityProfile: null,
          rootFolder: null,
        })
      }
      const profile = qualityProfile ?? instance.qualityProfile ?? null
      return routeDestination(type, {
        exclude,
        instanceName: instance.name,
        qualityProfile:
          profile === null
            ? INSTANCE_DEFAULT
            : profileName(instance.id, profile),
        rootFolder: rootFolder || instance.rootFolder || INSTANCE_DEFAULT,
      })
    },
  }
}

export type RouteTargets = ReturnType<typeof useRouteTargets>
