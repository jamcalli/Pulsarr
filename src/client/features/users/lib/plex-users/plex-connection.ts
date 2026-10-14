import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']

export function hasPlexToken(config: Config): boolean {
  return config.plexTokens.some((token) => token.trim() !== '')
}
