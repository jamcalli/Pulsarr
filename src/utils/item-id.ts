export function toItemId(id: string | number): number
export function toItemId(id: string | number | undefined): number | undefined
export function toItemId(id: string | number | undefined): number | undefined {
  return typeof id === 'string' ? Number.parseInt(id, 10) : id
}
