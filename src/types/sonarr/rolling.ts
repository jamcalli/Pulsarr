/**
 * Shared module for Sonarr rolling monitoring definitions
 * This module consolidates the rolling monitoring constants and utilities
 * to ensure consistency across client and server code.
 */

import { SonarrMonitoringOption } from '../sonarr.types.js'

/**
 * Centralized set of rolling monitoring options for consistent checking
 * Rolling options allow for progressive monitoring - starting with pilot or first season
 * and expanding as users watch more content.
 */
export const ROLLING_MONITORING_OPTIONS = new Set<string>([
  SonarrMonitoringOption.PILOT_ROLLING,
  SonarrMonitoringOption.FIRST_SEASON_ROLLING,
])

/**
 * Determines whether the given monitoring option is a recognized rolling monitoring option.
 *
 * @param option - The monitoring option to check.
 * @returns `true` if {@link option} is a rolling monitoring option; otherwise, `false`.
 */
export function isRollingMonitoringOption(option: string): boolean {
  return ROLLING_MONITORING_OPTIONS.has(option)
}
