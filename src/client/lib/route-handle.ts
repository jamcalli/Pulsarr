/** Set as a route's `handle` so the root layout draws the backdrop on phones, where the app shell has none. */
export const BACKDROP_ROUTE = { backdrop: true } as const

export function routeHasBackdrop(handle: unknown): boolean {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    'backdrop' in handle &&
    handle.backdrop === true
  )
}
