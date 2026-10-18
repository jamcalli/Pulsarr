import { MAINTAINERR_EXCLUSION_MODES } from '@root/schemas/config/config.schema'
import type { components } from '@/types/api.js'

type MaintainerrExclusionMode =
  components['schemas']['MaintainerrExclusionMode']

export const MAINTAINERR_EXCLUSION_MODE_LABELS: Record<
  MaintainerrExclusionMode,
  string
> = {
  watchlisters: 'Current watchlisters',
  global: 'Everyone',
}

export const MAINTAINERR_EXCLUSION_MODE_HELP: Record<
  MaintainerrExclusionMode,
  string
> = {
  watchlisters:
    'One exclusion per user watching it when Maintainerr deletes it.',
  global: 'One exclusion for every user.',
}

export const MAINTAINERR_EXCLUSION_MODE_OPTIONS: ReadonlyArray<{
  value: MaintainerrExclusionMode
  label: string
}> = MAINTAINERR_EXCLUSION_MODES.map((value) => ({
  value,
  label: MAINTAINERR_EXCLUSION_MODE_LABELS[value],
}))
