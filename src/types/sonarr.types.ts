export interface SonarrAddOptions {
  monitor: string
  searchForCutoffUnmetEpisodes: boolean
  searchForMissingEpisodes: boolean
}

export interface SonarrPost {
  title: string
  tvdbId: number
  qualityProfileId: number
  rootFolderPath: string
  addOptions: SonarrAddOptions
  languageProfileId: number
  monitored: boolean
  tags: number[]
}

export interface SonarrSeries {
  title: string
  imdbId?: string
  tvdbId?: number
  id: number
  ended?: boolean
}

export interface Item {
  title: string
  guids: string[]
  type: string
  ended?: boolean
}

export interface SonarrConfiguration {
  sonarrSeasonMonitoring: string
  sonarrQualityProfileId: number
  sonarrRootFolder: string
  sonarrLanguageProfileId: number
  sonarrTagIds: number[]
  sonarrBaseUrl: string
  sonarrApiKey: string
}
