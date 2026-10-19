import { create } from 'zustand'

interface SetupState {
  /** Set by the account menu and by a forced open, cleared when the dialog closes. */
  requested: boolean
  request: () => void
  dismiss: () => void
}

export const useSetupStore = create<SetupState>()((set) => ({
  requested: false,
  request: () => set({ requested: true }),
  dismiss: () => set({ requested: false }),
}))
