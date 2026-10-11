import type { RouterField } from '@root/schemas/content-router/router-fields.js'
import { certification } from './certification.js'
import type { BoundField } from './define-field.js'
import { genres } from './genres.js'
import { language } from './language.js'
import { plexList } from './plex-list.js'
import {
  imdbRating,
  imdbVotes,
  rtAudienceRating,
  rtCriticRating,
  tmdbRating,
} from './ratings.js'
import { season } from './season.js'
import { movieStatus, seriesStatus } from './status.js'
import { streamingServices } from './streaming.js'
import { user } from './user.js'
import { year } from './year.js'

export const FIELD_EVALUATORS = {
  year,
  season,
  genres,
  certification,
  language,
  imdbRating,
  imdbVotes,
  rtCriticRating,
  rtAudienceRating,
  tmdbRating,
  movieStatus,
  seriesStatus,
  streamingServices,
  plexList,
  user,
} as const satisfies Record<RouterField, BoundField>
