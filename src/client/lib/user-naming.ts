import { UserNamingSourceSchema } from '@root/schemas/common/user-naming-source.schema'
import type { components } from '@/types/api.js'

type UserNamingSource = components['schemas']['UserNamingSource']

export const USER_NAMING_SOURCE_LABELS: Record<UserNamingSource, string> = {
  username: 'Username',
  alias: 'Alias',
}

export const USER_NAMING_SOURCE_OPTIONS: ReadonlyArray<{
  value: UserNamingSource
  label: string
}> = UserNamingSourceSchema.options.map((value) => ({
  value,
  label: USER_NAMING_SOURCE_LABELS[value],
}))

export const SAMPLE_USER_NAMES: Record<UserNamingSource, string> = {
  username: 'jamie',
  alias: 'jj',
}

/** The alias when set, else the Plex username. */
export function displayName(user: {
  alias: string | null
  name: string
}): string {
  return user.alias ?? user.name
}
