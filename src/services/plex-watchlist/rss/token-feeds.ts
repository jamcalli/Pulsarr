import type { ConfigUpdate } from '@root/schemas/config/config.schema.js'

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((token, index) => token === b[index])
}

/** Clears both feed URLs when the update changes the tokens, unless it sets them itself, so another account never keeps the old feeds. */
export function withFeedsResetOnTokenChange(
  update: ConfigUpdate,
  currentTokens: readonly string[],
): ConfigUpdate {
  if (!update.plexTokens || sameTokens(update.plexTokens, currentTokens)) {
    return update
  }
  return { selfRss: '', friendsRss: '', ...update }
}
