import { z } from 'zod'

/** http and https only, other schemes are an SSRF vector. */
export const HttpUrlSchema = z.string().refine(
  (s) => {
    try {
      const url = new URL(s)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  },
  { message: 'Must be a valid http(s) URL' },
)

/** Stored and compared without a trailing slash, so path joins never double the separator. */
export const ArrBaseUrlSchema = HttpUrlSchema.transform((s) =>
  s.replace(/\/+$/, ''),
)

export const HttpUrlOptionalSchema = z
  .union([HttpUrlSchema, z.literal('')])
  .optional()
