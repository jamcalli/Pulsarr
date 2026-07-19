/**
 * Shared Bun.serve helpers for Radarr / Sonarr local mock servers.
 */

import { MOCK_API_KEY } from './fixtures.js'

export type RouteHandler = (
  request: Request,
  url: URL,
  params: Record<string, string>,
) => Response | Promise<Response>

export interface ArrMockRoute {
  method: string
  /** Path relative to /api/v3, e.g. "system/status" or "notification/:id" */
  path: string
  handler: RouteHandler
}

export interface ArrMockServerOptions {
  name: string
  port: number
  routes: ArrMockRoute[]
  /** When true, require X-Api-Key to match MOCK_API_KEY. Default true. */
  requireApiKey?: boolean
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function noContent(status = 200): Response {
  return new Response(null, { status })
}

export function notFound(message = 'Not Found'): Response {
  return json({ message }, 404)
}

function matchRoute(
  method: string,
  pathname: string,
  route: ArrMockRoute,
): Record<string, string> | null {
  if (route.method.toUpperCase() !== method.toUpperCase()) {
    return null
  }

  const expected = `/api/v3/${route.path}`.replace(/\/+$/, '')
  const actual = pathname.replace(/\/+$/, '') || '/'
  const expectedParts = expected.split('/')
  const actualParts = actual.split('/')

  if (expectedParts.length !== actualParts.length) {
    return null
  }

  const params: Record<string, string> = {}
  for (let i = 0; i < expectedParts.length; i++) {
    const expectedPart = expectedParts[i]
    const actualPart = actualParts[i]
    if (expectedPart.startsWith(':')) {
      params[expectedPart.slice(1)] = decodeURIComponent(actualPart)
      continue
    }
    if (expectedPart !== actualPart) {
      return null
    }
  }

  return params
}

export function startArrMockServer(options: ArrMockServerOptions) {
  const requireApiKey = options.requireApiKey !== false
  const label = `[mock-${options.name.toLowerCase()}]`

  const server = Bun.serve({
    port: options.port,
    hostname: '0.0.0.0',
    async fetch(request) {
      const url = new URL(request.url)
      const method = request.method.toUpperCase()

      if (requireApiKey) {
        const apiKey = request.headers.get('X-Api-Key')
        if (apiKey !== MOCK_API_KEY) {
          console.log(
            `${label} ${method} ${url.pathname} → 401 (invalid API key)`,
          )
          return json({ message: 'Unauthorized' }, 401)
        }
      }

      for (const route of options.routes) {
        const params = matchRoute(method, url.pathname, route)
        if (!params) {
          continue
        }

        try {
          const response = await route.handler(request, url, params)
          if (
            !(
              method === 'GET' &&
              (url.pathname.endsWith('/system/status') ||
                url.pathname.endsWith('/movie') ||
                url.pathname.endsWith('/series') ||
                url.pathname.endsWith('/notification') ||
                url.pathname.endsWith('/qualityprofile') ||
                url.pathname.endsWith('/rootfolder') ||
                url.pathname.endsWith('/tag'))
            )
          ) {
            console.log(
              `${label} ${method} ${url.pathname}${url.search} → ${response.status}`,
            )
          }
          return response
        } catch (error) {
          console.error(`${label} handler error:`, error)
          return json({ message: 'Internal Server Error' }, 500)
        }
      }

      console.log(`${label} ${method} ${url.pathname} → 404 (unhandled)`)
      return notFound(`No mock handler for ${method} ${url.pathname}`)
    },
  })

  console.log(
    `${label} listening on http://localhost:${server.port} (API key: ${MOCK_API_KEY})`,
  )

  return server
}

export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
): Promise<T> {
  return (await request.json()) as T
}
