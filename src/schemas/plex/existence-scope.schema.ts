import { z } from 'zod'

export const PLEX_EXISTENCE_SCOPES = ['owned', 'owned-and-shared'] as const

export const PLEX_EXISTENCE_SCOPE_DEFAULT =
  'owned-and-shared' satisfies (typeof PLEX_EXISTENCE_SCOPES)[number]

export const PlexExistenceScopeSchema = z.enum(PLEX_EXISTENCE_SCOPES).meta({
  id: 'PlexExistenceScope',
  description:
    'Which Plex servers the existence check covers, the owned server alone or also the servers shared with the account',
})
