/**
 * Global application constants
 */

// External URLs
export const DOCUMENTATION_URL = 'https://jamcalli.github.io/Pulsarr/docs/intro'

// Application metadata
export const APP_NAME = 'Pulsarr'
export const APP_DESCRIPTION = 'Plex watchlist tracker and notification center'

// UI/UX constants
export const LOADER_SHOW_DELAY = 125 // Loaders only appear when loading exceeds this (ms), preventing flash on fast responses
export const MIN_LOADING_DELAY = 500 // Once shown, loaders stay at least this long (ms)
export const SAVE_FEEDBACK_DELAY = 1500 // How long a save bar shows "saved" before it goes (ms)
export const OPERATION_RESULT_TTL = 30 * 60 * 1000 // How long a finished action's result stays in the mutation cache after its page unmounts (ms)
export const SEARCH_DEBOUNCE_DELAY = 300 // How long a search box waits after the last keystroke before it queries (ms)
