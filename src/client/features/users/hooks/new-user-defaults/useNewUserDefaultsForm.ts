import type { MediaDefaultsValues } from '@/features/users/components/new-user-defaults/media-defaults-section'
import { NewUserDefaultsFormSchema } from '@/features/users/lib/new-user-defaults-form.schema'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type ConfigUpdate = components['schemas']['ConfigUpdatePayload']

interface NewUserDefaultsValues {
  newUserDefaultCanSync: boolean
  newUserDefaultRequiresApproval: boolean
  movie: MediaDefaultsValues
  show: MediaDefaultsValues
}

const DEFAULT_WATCHLIST_CAP = 100

function toMediaValues(config: Config, media: 'Movie' | 'Show') {
  const cap = config[`newUserDefault${media}WatchlistCap`]
  return {
    quotaOn: config[`newUserDefault${media}QuotaEnabled`],
    quotaType: config[`newUserDefault${media}QuotaType`],
    limit: config[`newUserDefault${media}QuotaLimit`],
    bypassApproval: config[`newUserDefault${media}BypassApproval`],
    capOn: cap !== null,
    cap: cap ?? DEFAULT_WATCHLIST_CAP,
  }
}

function toFormValues(config: Config): NewUserDefaultsValues {
  return {
    newUserDefaultCanSync: config.newUserDefaultCanSync,
    newUserDefaultRequiresApproval: config.newUserDefaultRequiresApproval,
    movie: toMediaValues(config, 'Movie'),
    show: toMediaValues(config, 'Show'),
  }
}

function capPayload({ capOn, cap }: MediaDefaultsValues) {
  return capOn && cap !== undefined ? cap : null
}

function toPayload({
  movie,
  show,
  ...access
}: NewUserDefaultsValues): ConfigUpdate {
  return {
    ...access,
    newUserDefaultMovieQuotaEnabled: movie.quotaOn,
    newUserDefaultMovieQuotaType: movie.quotaType,
    newUserDefaultMovieQuotaLimit: movie.limit,
    newUserDefaultMovieBypassApproval: movie.bypassApproval,
    newUserDefaultMovieWatchlistCap: capPayload(movie),
    newUserDefaultShowQuotaEnabled: show.quotaOn,
    newUserDefaultShowQuotaType: show.quotaType,
    newUserDefaultShowQuotaLimit: show.limit,
    newUserDefaultShowBypassApproval: show.bypassApproval,
    newUserDefaultShowWatchlistCap: capPayload(show),
  }
}

export function useNewUserDefaultsForm(config: Config) {
  return useConfigForm({
    config,
    toValues: toFormValues,
    schema: NewUserDefaultsFormSchema,
    toPayload,
  })
}
