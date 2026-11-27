import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

export const AppriseFormSchema = ConfigUpdateSchema.pick({
  appriseUrl: true,
  appriseEmailSender: true,
  systemAppriseUrl: true,
}).required()
