import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const AppriseFormSchema = ConfigUpdateSchema.pick({
  appriseEmailSender: true,
  systemAppriseUrl: true,
}).required()
