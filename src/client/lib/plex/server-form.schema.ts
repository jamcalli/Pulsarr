import { HttpUrlSchema } from '@root/schemas/common/url.schema'
import { z } from 'zod'
import {
  CONNECTION_MODES,
  type ServerFormValues,
} from '@/lib/plex/server-address'

/** The address error the field and the save bar both show, null when the values can be saved. */
export function addressError(values: ServerFormValues): string | null {
  if (values.connection !== 'address') return null
  const address = values.address.trim()
  if (address === '') return 'Enter a server address, or choose Automatic.'
  if (!HttpUrlSchema.safeParse(address).success) {
    return 'Start the address with http:// or https://.'
  }
  return null
}

const ServerSettingsSchema = z
  .object({
    connection: z.enum(CONNECTION_MODES),
    address: z.string(),
    skipIfExistsOnPlex: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const message = addressError(values)
    if (message) ctx.addIssue({ code: 'custom', path: ['address'], message })
  })

export const ServerFormSchema = z.object({ server: ServerSettingsSchema })
