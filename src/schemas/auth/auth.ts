import { z } from 'zod'

// Database model
export interface AdminUser {
    id: number;
    username: string;
    password: string;
    role: string;
  }
  
  export const CredentialsSchema = z.object({
    username: z.string().min(1).max(255),
    password: z.string().min(1).max(255)
  })
  
  export type Credentials = z.infer<typeof CredentialsSchema>
  
  export const AuthSchema = CredentialsSchema.omit({ password: true }).extend({
    id: z.number(),
    role: z.string()
  })
  
  export type Auth = z.infer<typeof AuthSchema>