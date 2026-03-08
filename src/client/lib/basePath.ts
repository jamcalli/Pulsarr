/**
 * Resolves the base path from the <base> tag injected by the server.
 * Returns '/' for root deployments or '/pulsarr' for subfolder deployments.
 */
function resolveBasePath(): string {
  const baseEl = document.querySelector('base')
  if (baseEl) {
    return new URL(baseEl.href).pathname.replace(/\/+$/, '') || '/'
  }
  return '/'
}

export const BASE_PATH = resolveBasePath()
