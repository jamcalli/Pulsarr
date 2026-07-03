import * as React from "react"

export function useMediaQuery(query: string) {
  // Read synchronously on first render to avoid a flash of the wrong layout
  const [value, setValue] = React.useState(() => matchMedia(query).matches)

  React.useEffect(() => {
    function onChange(event: MediaQueryListEvent) {
      setValue(event.matches)
    }

    const result = matchMedia(query)
    result.addEventListener("change", onChange)
    setValue(result.matches)

    return () => result.removeEventListener("change", onChange)
  }, [query])

  return value
}