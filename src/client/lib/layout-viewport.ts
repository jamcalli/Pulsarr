export interface ViewportSize {
  width: number
  height: number
  dpr: number
}

/** Layout viewport in CSS px, which a mobile keyboard does not shrink. */
export function layoutViewport(): ViewportSize {
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
    dpr: window.devicePixelRatio || 1,
  }
}

export function sameViewport(a: ViewportSize | null, b: ViewportSize) {
  return (
    a !== null &&
    a.width === b.width &&
    a.height === b.height &&
    a.dpr === b.dpr
  )
}
