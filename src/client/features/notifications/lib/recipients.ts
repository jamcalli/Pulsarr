export interface Recipient<Id extends string | number> {
  id: Id
  name: string
}

/** Recipients whose name or `idOf` id contains the query, or all of them while a user is picked or the query is empty. */
export function matchRecipients<Recipient extends { name: string }>(
  recipients: readonly Recipient[],
  query: string,
  picked: boolean,
  idOf?: (recipient: Recipient) => string,
): Recipient[] {
  const needle = query.trim().toLowerCase()
  if (picked || needle === '') return [...recipients]
  return recipients.filter(
    (recipient) =>
      recipient.name.toLowerCase().includes(needle) ||
      (idOf?.(recipient).includes(needle) ?? false),
  )
}
