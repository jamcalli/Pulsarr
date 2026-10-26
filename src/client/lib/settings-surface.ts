import { createContext } from 'react'

/** How a settings section draws itself: a card on pages, a headed group inside a dialog, or bare rows under a heading that already names it. */
export type SettingsSurface = 'card' | 'flat' | 'rows'

export const SettingsSurfaceContext = createContext<SettingsSurface>('card')
