interface SelectOption {
  value: string
  label: string
}

/** Appends a stored value no option carries as one extra option, labelled with the raw value unless `label` is given. */
export function withStoredOption<T extends SelectOption>(
  options: readonly T[],
  stored: string | null,
  label?: string,
): Array<T | SelectOption> {
  if (stored === null || options.some((option) => option.value === stored)) {
    return [...options]
  }
  return [...options, { value: stored, label: label ?? stored }]
}
