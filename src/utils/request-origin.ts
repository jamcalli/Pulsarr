import { splitUrlList } from '@root/schemas/common/url-list.js'
import { isSameServerEndpoint } from '@utils/url.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface RequestOriginFacts {
  method: string
  host: string
  origin: string | undefined
  secFetchSite: string | undefined
  hasApiKey: boolean
}

/** Parses a comma-separated origin list into normalized origins, throwing on an entry that is not an http or https origin. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return splitUrlList(value).map((entry) => {
    const url = URL.canParse(entry) ? new URL(entry) : null
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
      throw new Error(
        `allowedOrigins entry "${entry}" is not an http or https origin such as https://dashboard.example.com`,
      )
    }
    return url.origin
  })
}

function isSameHostOrigin(origin: string, host: string): boolean {
  if (!host || !URL.canParse(origin)) return false
  // Scheme comes from the origin because a TLS-terminating proxy hides it from the server
  return isSameServerEndpoint(origin, `${new URL(origin).protocol}//${host}`)
}

/** Whether a request may proceed: safe methods, API key callers, non-browser callers, same-origin pages and listed origins pass. */
export function isTrustedRequestOrigin(
  facts: RequestOriginFacts,
  allowedOrigins: readonly string[],
): boolean {
  if (SAFE_METHODS.has(facts.method) || facts.hasApiKey) return true
  if (facts.origin === undefined) return true
  if (facts.secFetchSite === 'same-origin') return true
  if (allowedOrigins.includes(facts.origin)) return true
  return isSameHostOrigin(facts.origin, facts.host)
}
