import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'

const Expiration = ConfigUpdateSchema.shape.approvalExpiration.unwrap()
const { shape } = Expiration

// required() would report Zod's nonoptional message instead of each field's own error.
export const ApprovalSettingsFormSchema = ConfigUpdateSchema.pick({
  approvalNotify: true,
})
  .required()
  .extend({
    approvalExpiration: Expiration.extend({
      enabled: shape.enabled.unwrap(),
      defaultExpirationHours: shape.defaultExpirationHours.unwrap(),
      expirationAction: shape.expirationAction.unwrap(),
      autoApproveOnQuotaAvailable: shape.autoApproveOnQuotaAvailable.unwrap(),
      cleanupExpiredDays: shape.cleanupExpiredDays.unwrap(),
    }),
  })
