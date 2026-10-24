import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const MaintainerrFormSchema = ConfigUpdateSchema.pick({
  maintainerrEnabled: true,
  maintainerrUrl: true,
  maintainerrExclusionMode: true,
})
  .required()
  .refine(
    (values) => !values.maintainerrEnabled || values.maintainerrUrl !== '',
    {
      error: 'Enter the Maintainerr URL to turn it on.',
      path: ['maintainerrUrl'],
    },
  )
