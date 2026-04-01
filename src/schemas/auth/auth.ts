import {
  EmailSchema,
  UsernameSchema,
} from '@root/schemas/common/auth-fields.schema.js'
import { z } from 'zod'

export interface AdminUser {
  id: number
  username: string
  email: string
  password: string
  role: string
}

export const AuthSchema = z.object({
  id: z.number(),
  email: EmailSchema,
  username: UsernameSchema,
  role: z.string(),
})

export type Auth = z.infer<typeof AuthSchema>
