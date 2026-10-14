export interface ToolbarFilter<T extends string | number = string | number> {
  label: string
  value: T | null
  options: ReadonlyArray<{ value: T; label: string }>
  /** Method syntax keeps a narrowed filter assignable to the widened list type. */
  onValueChange(next: T | null): void
  /** The desktop select width, shared with the toolbar skeleton. */
  width: string
}

export function toolbarFilter<T extends string | number>(
  filter: ToolbarFilter<T>,
): ToolbarFilter {
  return filter
}
