import type { Config } from '@root/types/config.types'

export interface ConfigResponse {
  success: boolean
  config: Config
}

export interface GenresResponse {
  success: boolean
  genres: string[]
}
