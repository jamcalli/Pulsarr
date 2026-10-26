export function recipientLabel(user: {
  name: string
  alias?: string | null
}): string {
  return user.alias ? `${user.name} (${user.alias})` : user.name
}
