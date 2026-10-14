import { WATCHLIST_CAP_SUGGESTED } from '@root/schemas/shared/quota-limits'
import { NewUserDefaultsFormSchema } from '@/features/users/lib/new-user-defaults-form.schema'
import {
  capPayload,
  type QuotaFieldValues,
} from '@/features/users/lib/quota-fields'
import { useConfigForm } from '@/hooks/useConfigForm'
import type { components } from '@/types/api.js'

type Config = components['schemas']['Config']
type ConfigUpdate = components['schemas']['ConfigUpdatePayload']

interface NewUserDefaultsValues {
  newUserDefaultCanSync: boolean
  newUserDefaultRequiresApproval: boolean
  movie: QuotaFieldValues
  show: QuotaFieldValues
}

function toMediaValues(
  config: Config,
  media: 'Movie' | 'Show',
): QuotaFieldValues {
  const cap = config[`newUserDefault${media}WatchlistCap`]
  return {
    on: config[`newUserDefault${media}QuotaEnabled`],
    quotaType: config[`newUserDefault${media}QuotaType`],
    quotaLimit: config[`newUserDefault${media}QuotaLimit`],
    bypassApproval: config[`newUserDefault${media}BypassApproval`],
    capOn: cap !== null,
    cap: cap ?? WATCHLIST_CAP_SUGGESTED,
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

function toPayload({
  movie,
  show,
  ...access
}: NewUserDefaultsValues): ConfigUpdate {
  return {
    ...access,
    newUserDefaultMovieQuotaEnabled: movie.on,
    newUserDefaultMovieQuotaType: movie.quotaType,
    newUserDefaultMovieQuotaLimit: movie.quotaLimit,
    newUserDefaultMovieBypassApproval: movie.bypassApproval,
    newUserDefaultMovieWatchlistCap: capPayload(movie),
    newUserDefaultShowQuotaEnabled: show.on,
    newUserDefaultShowQuotaType: show.quotaType,
    newUserDefaultShowQuotaLimit: show.quotaLimit,
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
