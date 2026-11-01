import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const ApprovalSettingsFormSchema = ConfigUpdateSchema.pick({
  approvalNotify: true,
  approvalExpiration: true,
}).required()
