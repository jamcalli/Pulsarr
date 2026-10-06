import { useArrInstances } from '@/hooks/useArrInstances'
import { proposedRouting } from '@/lib/approval'
import { arrTypeOf } from '@/lib/arr-labels'
import type { components } from '@/types/api.js'

type ApprovalRequest = components['schemas']['ApprovalRequest']

/** Target is null without routing or until the instance list loads. */
export function useApprovalTarget(approval: ApprovalRequest) {
  const routing = proposedRouting(approval.proposedRouterDecision)
  const type = routing?.instanceType ?? arrTypeOf(approval.contentType)
  const instances = useArrInstances(type)
  const target = routing ? instances.findTarget(routing.instanceId) : null

  return { routing, type, instances, target }
}
