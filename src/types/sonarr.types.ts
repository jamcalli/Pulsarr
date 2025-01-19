export interface SonarrAddOptions {
  monitor: string
  searchForCutoffUnmetEpisodes: boolean
  searchForMissingEpisodes: boolean
}

interface QualityItem {
  id: number
  name: string
  quality: {
    id: number
    name: string
    source: string
    resolution: number
  }
  items: string[]
  allowed: boolean
}

interface FormatItem {
  id: number
  format: number
  name: string
  score: number
}

export interface QualityProfile {
  id: number
  name: string
  upgradeAllowed: boolean
  cutoff: number
  items: QualityItem[]
  minFormatScore: number
  cutoffFormatScore: number
  minUpgradeFormatScore: number
  formatItems: FormatItem[]
}

export interface RootFolder {
  path: string
  accessible: boolean
  freeSpace: number
  totalSpace: number
  id: number
}

export interface PagedResult<T> {
  page: number
  pageSize: number
  sortKey: string
  sortDirection: 'default' | 'ascending' | 'descending'
  totalRecords: number
  records: T[]
}

export interface SonarrPost {
  title: string
  tvdbId: number
  qualityProfileId?: number | null
  rootFolderPath?: string
  addOptions: SonarrAddOptions
  languageProfileId?: number | null
  monitored: boolean
  tags: string[]
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
  sonarrQualityProfileId: number | null
  sonarrRootFolder: string | null
  sonarrLanguageProfileId: number | null
  sonarrTagIds: string[]
  sonarrBaseUrl: string
  sonarrApiKey: string
}
