import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'
import { z } from 'zod'

const { shape } = ConfigUpdateSchema

function mediaDefaultsSchema(media: 'Movie' | 'Show') {
  const cap = shape[`newUserDefault${media}WatchlistCap`].unwrap().unwrap()
  return z
    .object({
      quotaOn: shape[`newUserDefault${media}QuotaEnabled`].unwrap(),
      quotaType: shape[`newUserDefault${media}QuotaType`].unwrap(),
      limit: shape[`newUserDefault${media}QuotaLimit`].unwrap(),
      bypassApproval: shape[`newUserDefault${media}BypassApproval`].unwrap(),
      capOn: z.boolean(),
      cap: z.number().optional(),
    })
    .superRefine((value, ctx) => {
      if (!value.capOn) return
      const result = cap.safeParse(value.cap)
      for (const issue of result.error?.issues ?? []) {
        ctx.addIssue({ code: 'custom', message: issue.message, path: ['cap'] })
      }
    })
}

export const NewUserDefaultsFormSchema = z.object({
  newUserDefaultCanSync: shape.newUserDefaultCanSync.unwrap(),
  newUserDefaultRequiresApproval: shape.newUserDefaultRequiresApproval.unwrap(),
  movie: mediaDefaultsSchema('Movie'),
  show: mediaDefaultsSchema('Show'),
})
