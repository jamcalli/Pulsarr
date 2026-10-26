import { z } from 'zod'

export const UserNamingSourceSchema = z.enum(['username', 'alias']).meta({
  id: 'UserNamingSource',
  description: 'Which user name a per-user tag or label is built from',
})
