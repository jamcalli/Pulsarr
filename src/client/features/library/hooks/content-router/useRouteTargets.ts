import type { RouteType } from '@/features/library/lib/content-router/condition-fields'
import {
  type FallbackTarget,
  routeDestination,
} from '@/features/library/lib/content-router/route-list'
import { useArrInstances } from '@/hooks/useArrInstances'
import { useQualityProfileNames } from '@/hooks/useQualityProfileNames'
import type { components } from '@/types/api.js'

type RouterRule = components['schemas']['RouterRule']

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

  const destination = ({
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
        profile === null ? INSTANCE_DEFAULT : profileName(instance.id, profile),
      rootFolder: rootFolder || instance.rootFolder || INSTANCE_DEFAULT,
    })
  }

  return {
    instances,
    fallback,
    hasInstance: instances.configuredTargets.length > 0,
    destination,
    ruleDestination: (rule: RouterRule) =>
      destination({
        exclude: rule.exclude_from_routing ?? false,
        instanceId: rule.target_instance_id,
        qualityProfile: rule.quality_profile || null,
        rootFolder: rule.root_folder || null,
      }),
  }
}

export type RouteTargets = ReturnType<typeof useRouteTargets>
