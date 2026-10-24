export function stubViewport({
  mobile,
  coarsePointer = false,
}: {
  mobile: boolean
  coarsePointer?: boolean
}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches:
      (mobile && query === '(max-width: 767px)') ||
      (coarsePointer && query === '(pointer: coarse)'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}
