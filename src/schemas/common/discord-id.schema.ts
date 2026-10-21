import { z } from 'zod'

const DISCORD_SNOWFLAKE = /^\d{17,20}$/

export function isDiscordSnowflake(value: string): boolean {
  return DISCORD_SNOWFLAKE.test(value.trim())
}

export const DiscordIdSchema = z
  .string()
  .trim()
  .regex(DISCORD_SNOWFLAKE, { message: 'Must be a Discord user ID' })
