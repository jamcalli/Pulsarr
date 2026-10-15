import type { ConfigUpdate } from '@root/schemas/config/config.schema.js'

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((token, index) => token === b[index])
}

/** Clears both feeds when the tokens change, unless the update sets them itself. */
export function withFeedsResetOnTokenChange(
  update: ConfigUpdate,
  currentTokens: readonly string[],
): ConfigUpdate {
  if (!update.plexTokens || sameTokens(update.plexTokens, currentTokens)) {
    return update
  }
  return { selfRss: '', friendsRss: '', ...update }
}
