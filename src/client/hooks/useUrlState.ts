import { useSearchParams } from 'react-router-dom'

export function useUrlState<T extends { page: number }>(
  parse: (params: URLSearchParams) => T,
  serialize: (state: T) => URLSearchParams,
) {
  const [searchParams, setSearchParams] = useSearchParams()
  const state = parse(searchParams)

  return {
    state,
    setState: (next: T) => setSearchParams(serialize(next), { replace: true }),
    pageHref: (page: number) => {
      const query = serialize({ ...state, page }).toString()
      return query ? `?${query}` : '?'
    },
  }
}
