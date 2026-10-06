import { SonarrSeasonMonitoringSchema } from '@root/schemas/sonarr/season-monitoring.schema.js'

export function invalidSeasonMonitoringMessage(value: string): string {
  return `Invalid season monitoring value: ${value}`
}

export class InvalidSeasonMonitoringError extends Error {
  constructor(value: string) {
    super(invalidSeasonMonitoringMessage(value))
    this.name = 'InvalidSeasonMonitoringError'
  }
}

/** Returns next when it is neither a known option nor already stored on the record, so legacy rows keep round-tripping. */
export function rejectedSeasonMonitoring(
  next: string | null | undefined,
  stored: ReadonlyArray<string | null | undefined>,
): string | undefined {
  if (next == null || stored.includes(next)) return undefined
  return SonarrSeasonMonitoringSchema.safeParse(next).success ? undefined : next
}

interface DecisionSeasonMonitoring {
  routing?: { seasonMonitoring?: string | null }
  approval?: { proposedRouting?: { seasonMonitoring?: string | null } }
}

function decisionValues(decision?: DecisionSeasonMonitoring) {
  return [
    decision?.routing?.seasonMonitoring,
    decision?.approval?.proposedRouting?.seasonMonitoring,
  ]
}

/** The first value in next that is neither a known option nor already on stored, or undefined when all pass. */
export function rejectedDecisionSeasonMonitoring(
  next: DecisionSeasonMonitoring | undefined,
  stored?: DecisionSeasonMonitoring,
): string | undefined {
  const kept = decisionValues(stored)
  for (const value of decisionValues(next)) {
    const rejected = rejectedSeasonMonitoring(value, kept)
    if (rejected !== undefined) return rejected
  }
  return undefined
}
