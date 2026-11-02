export type ArrNotificationFlags = Readonly<
  Record<
    `on${string}` | `supportsOn${string}` | 'includeHealthWarnings',
    boolean
  >
>

export interface ArrWebhookField {
  order: number
  name: string
  label: string
  value?: string | number | Array<{ key: string; value: string }>
  type: string
  advanced: boolean
  helpText?: string
  selectOptions?: Array<{
    value: number
    name: string
    order: number
    dividerAfter: boolean
  }>
  privacy?: string
  isFloat?: boolean
}

/** One complete object per product, since each arr accepts only its own event flags and field set. */
export interface ArrProduct {
  appName: 'Sonarr' | 'Radarr'
  idField: 'tvdbId' | 'tmdbId'
  itemEndpoint: 'series' | 'movie'
  itemsLabel: 'series' | 'movies'
  /** The id list key in the body of PUT {itemEndpoint}/editor. */
  editorIdsKey: 'seriesIds' | 'movieIds'
  webhook: {
    flags: ArrNotificationFlags
    fields: (url: string, secret: string) => ArrWebhookField[]
    infoLink: string
  }
  plexNotification: {
    flags: ArrNotificationFlags
    infoLink: string
  }
}

export const SONARR = {
  appName: 'Sonarr',
  idField: 'tvdbId',
  itemEndpoint: 'series',
  itemsLabel: 'series',
  editorIdsKey: 'seriesIds',
  webhook: {
    flags: {
      onGrab: false,
      onDownload: true,
      onUpgrade: false,
      // ImportComplete has no upgrade gate and repeats every per-file Download, so it stays off
      onImportComplete: false,
      onRename: false,
      onSeriesAdd: false,
      onSeriesDelete: false,
      onEpisodeFileDelete: false,
      onEpisodeFileDeleteForUpgrade: false,
      onHealthIssue: false,
      includeHealthWarnings: false,
      onHealthRestored: false,
      onApplicationUpdate: false,
      onManualInteractionRequired: false,
      supportsOnGrab: true,
      supportsOnDownload: true,
      supportsOnUpgrade: true,
      supportsOnImportComplete: true,
      supportsOnRename: true,
      supportsOnSeriesAdd: true,
      supportsOnSeriesDelete: true,
      supportsOnEpisodeFileDelete: true,
      supportsOnEpisodeFileDeleteForUpgrade: true,
      supportsOnHealthIssue: true,
      supportsOnHealthRestored: true,
      supportsOnApplicationUpdate: true,
      supportsOnManualInteractionRequired: true,
    },
    fields: (url, secret) => [
      {
        order: 0,
        name: 'url',
        label: 'Webhook URL',
        value: url,
        type: 'url',
        advanced: false,
      },
      {
        order: 1,
        name: 'method',
        label: 'Method',
        value: 1,
        type: 'select',
        advanced: false,
      },
      {
        order: 2,
        name: 'headers',
        label: 'Headers',
        value: [{ key: 'X-Pulsarr-Secret', value: secret }],
        type: 'keyValueList',
        advanced: true,
      },
    ],
    infoLink: 'https://wiki.servarr.com/sonarr/supported#webhook',
  },
  plexNotification: {
    flags: {
      onGrab: false,
      onDownload: true,
      onUpgrade: true,
      onRename: true,
      onSeriesDelete: true,
      onEpisodeFileDelete: true,
      onEpisodeFileDeleteForUpgrade: true,
      onHealthIssue: false,
      onApplicationUpdate: false,
      supportsOnGrab: false,
      supportsOnDownload: true,
      supportsOnUpgrade: true,
      supportsOnRename: true,
      supportsOnSeriesDelete: true,
      supportsOnEpisodeFileDelete: true,
      supportsOnEpisodeFileDeleteForUpgrade: true,
      supportsOnHealthIssue: false,
      supportsOnApplicationUpdate: false,
      includeHealthWarnings: false,
    },
    infoLink: 'https://wiki.servarr.com/sonarr/supported#plexserver',
  },
} satisfies ArrProduct

export const RADARR = {
  appName: 'Radarr',
  idField: 'tmdbId',
  itemEndpoint: 'movie',
  itemsLabel: 'movies',
  editorIdsKey: 'movieIds',
  webhook: {
    flags: {
      onGrab: false,
      onDownload: true,
      onUpgrade: false,
      onRename: false,
      onMovieAdded: false,
      onMovieDelete: false,
      onMovieFileDelete: false,
      onMovieFileDeleteForUpgrade: false,
      onHealthIssue: false,
      includeHealthWarnings: false,
      onHealthRestored: false,
      onApplicationUpdate: false,
      onManualInteractionRequired: false,
      supportsOnGrab: true,
      supportsOnDownload: true,
      supportsOnUpgrade: true,
      supportsOnRename: true,
      supportsOnMovieAdded: true,
      supportsOnMovieDelete: true,
      supportsOnMovieFileDelete: true,
      supportsOnMovieFileDeleteForUpgrade: true,
      supportsOnHealthIssue: true,
      supportsOnHealthRestored: true,
      supportsOnApplicationUpdate: true,
      supportsOnManualInteractionRequired: true,
    },
    fields: (url, secret) => [
      {
        order: 0,
        name: 'url',
        label: 'Webhook URL',
        value: url,
        type: 'url',
        advanced: false,
        privacy: 'normal',
        isFloat: false,
      },
      {
        order: 1,
        name: 'method',
        label: 'Method',
        helpText: 'Which HTTP method to use submit to the Webservice',
        value: 1,
        type: 'select',
        advanced: false,
        selectOptions: [
          { value: 1, name: 'POST', order: 1, dividerAfter: false },
          { value: 2, name: 'PUT', order: 2, dividerAfter: false },
        ],
        privacy: 'normal',
        isFloat: false,
      },
      {
        order: 2,
        name: 'username',
        label: 'Username',
        type: 'textbox',
        advanced: false,
        privacy: 'userName',
        isFloat: false,
      },
      {
        order: 3,
        name: 'password',
        label: 'Password',
        type: 'password',
        advanced: false,
        privacy: 'password',
        isFloat: false,
      },
      {
        order: 4,
        name: 'headers',
        label: 'Headers',
        value: [{ key: 'X-Pulsarr-Secret', value: secret }],
        type: 'keyValueList',
        advanced: true,
        privacy: 'normal',
        isFloat: false,
      },
    ],
    infoLink: 'https://wiki.servarr.com/radarr/supported#webhook',
  },
  plexNotification: {
    flags: {
      onGrab: false,
      onDownload: true,
      onUpgrade: true,
      onRename: true,
      onMovieDelete: true,
      onMovieFileDelete: true,
      onMovieFileDeleteForUpgrade: true,
      onHealthIssue: false,
      onApplicationUpdate: false,
      supportsOnGrab: false,
      supportsOnDownload: true,
      supportsOnUpgrade: true,
      supportsOnRename: true,
      supportsOnMovieDelete: true,
      supportsOnMovieFileDelete: true,
      supportsOnMovieFileDeleteForUpgrade: true,
      supportsOnHealthIssue: false,
      supportsOnApplicationUpdate: false,
      includeHealthWarnings: false,
    },
    infoLink: 'https://wiki.servarr.com/radarr/supported#plexserver',
  },
} satisfies ArrProduct
