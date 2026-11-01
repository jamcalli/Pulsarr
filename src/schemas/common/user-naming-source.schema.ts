import { z } from 'zod'

export const UserNamingSourceSchema = z.enum(['username', 'alias']).meta({
  id: 'UserNamingSource',
  description: 'Which user name a per-user tag or label is built from',
})

export const USER_NAMING_SOURCE_DEFAULT = 'username' satisfies z.infer<
  typeof UserNamingSourceSchema
>
