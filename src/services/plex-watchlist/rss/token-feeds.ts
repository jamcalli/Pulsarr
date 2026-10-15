import type { ConfigUpdate } from '@root/schemas/config/config.schema.js'

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((token, index) => token === b[index])
}

/** True only when the update sets tokens that differ from the current ones. */
export function plexTokensChanged(
  update: ConfigUpdate,
  currentTokens: readonly string[],
): boolean {
  return (
    update.plexTokens !== undefined &&
    !sameTokens(update.plexTokens, currentTokens)
  )
}

/** Clears both feeds when the tokens change, unless the update sets them itself. */
export function withFeedsResetOnTokenChange(
  update: ConfigUpdate,
  currentTokens: readonly string[],
): ConfigUpdate {
  if (!plexTokensChanged(update, currentTokens)) return update
  return { selfRss: '', friendsRss: '', ...update }
}
