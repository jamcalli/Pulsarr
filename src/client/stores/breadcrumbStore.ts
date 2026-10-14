import { create } from 'zustand'

interface BreadcrumbState {
  tail: string | null
  setTail: (tail: string | null) => void
}

export const useBreadcrumbStore = create<BreadcrumbState>()((set) => ({
  tail: null,
  setTail: (tail) => set({ tail }),
}))
