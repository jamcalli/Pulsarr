/**
 * Global application constants
 */

// Application metadata
export const APP_NAME = 'Pulsarr'
export const APP_DESCRIPTION = 'Plex watchlist tracker and notification center'

// UI/UX constants
export const LOADER_SHOW_DELAY = 125 // Loaders only appear when loading exceeds this (ms), preventing flash on fast responses
export const MIN_LOADING_DELAY = 500 // Once shown, loaders stay at least this long (ms)
export const QUERY_RETRY_LIMIT = 3 // How many times a failed query retries before it shows its error
export const QUERY_RETRY_DELAY_MS = 1000 // First retry backoff, doubled on each later retry (ms)
export const QUERY_RETRY_DELAY_MAX_MS = 10_000 // Cap on the doubled retry backoff (ms)
export const SAVE_FEEDBACK_DELAY = 1500 // How long a save bar shows "saved" before it goes (ms)
export const COPY_FEEDBACK_DELAY = 2000 // How long a copy button shows its copied check before it goes back (ms)
export const OPERATION_RESULT_TTL = 30 * 60 * 1000 // How long a finished action's result stays in the mutation cache after its page unmounts (ms)
export const CONNECTION_CHECK_STALE_TIME = 5 * 60 * 1000 // How long a page-load connection check per instance is reused before it runs again (ms)
export const SEARCH_DEBOUNCE_DELAY = 300 // How long a search box waits after the last keystroke before it queries (ms)
export const WATCHLIST_EVENT_COALESCE_MS = 1000 // How long watchlist progress events collect before one refetch runs, so a routing burst refetches once (ms)
