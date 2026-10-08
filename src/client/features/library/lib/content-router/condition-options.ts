export interface ConditionOption {
  value: string
  label: string
  description?: string
}

export type OptionSource =
  | 'genres'
  | 'certifications'
  | 'movieStatuses'
  | 'seriesStatuses'
  | 'users'
  | 'streamingServices'

export const CERTIFICATION_OPTIONS: ConditionOption[] = [
  {
    value: 'G',
    label: 'G',
    description:
      'General audiences. United States, Canada, Australia, Japan, New Zealand',
  },
  {
    value: 'PG',
    label: 'PG',
    description:
      'Parental guidance. United States, United Kingdom, Canada, Australia, New Zealand',
  },
  {
    value: 'PG-13',
    label: 'PG-13',
    description: 'Parents strongly cautioned. United States',
  },
  { value: 'R', label: 'R', description: 'Restricted. United States, Canada' },
  { value: 'NC-17', label: 'NC-17', description: 'Adults only. United States' },
  { value: 'NR', label: 'NR', description: 'Not rated. United States' },
  { value: 'UR', label: 'UR', description: 'Unrated. United States' },
  {
    value: 'TV-Y',
    label: 'TV-Y',
    description: 'All children. United States TV',
  },
  {
    value: 'TV-Y7',
    label: 'TV-Y7',
    description: 'Older children, 7 and over. United States TV',
  },
  {
    value: 'TV-Y7-FV',
    label: 'TV-Y7-FV',
    description: 'Older children, fantasy violence. United States TV',
  },
  {
    value: 'TV-G',
    label: 'TV-G',
    description: 'General audience. United States TV',
  },
  {
    value: 'TV-PG',
    label: 'TV-PG',
    description: 'Parental guidance suggested. United States TV',
  },
  {
    value: 'TV-14',
    label: 'TV-14',
    description: 'Parents strongly cautioned. United States TV',
  },
  {
    value: 'TV-MA',
    label: 'TV-MA',
    description: 'Mature audience only. United States TV',
  },
  {
    value: 'U',
    label: 'U',
    description: 'Universal, all audiences. United Kingdom, France',
  },
  { value: '10', label: '10', description: 'Not recommended under 10. France' },
  {
    value: '12',
    label: '12',
    description: '12 and over. United Kingdom, France',
  },
  {
    value: '12A',
    label: '12A',
    description: '12 and over, cinema. United Kingdom',
  },
  { value: '15', label: '15', description: '15 and over. United Kingdom' },
  { value: '16', label: '16', description: 'Not recommended under 16. France' },
  {
    value: '18',
    label: '18',
    description: 'Adults only. United Kingdom, France',
  },
  {
    value: 'R18',
    label: 'R18',
    description: 'Restricted to 18 and over. United Kingdom, New Zealand',
  },
  { value: '14A', label: '14A', description: 'Under 14 with an adult. Canada' },
  { value: '18A', label: '18A', description: 'Under 18 with an adult. Canada' },
  { value: 'E', label: 'E', description: 'Exempt. Canada' },
  { value: 'M', label: 'M', description: 'Mature. Australia, New Zealand' },
  {
    value: 'MA15+',
    label: 'MA15+',
    description: 'Mature, under 15 with an adult. Australia',
  },
  {
    value: 'R15+',
    label: 'R15+',
    description: 'Restricted to 15 and over. Japan',
  },
  {
    value: 'R18+',
    label: 'R18+',
    description: 'Restricted to 18 and over. Australia, Japan',
  },
  {
    value: 'X18+',
    label: 'X18+',
    description: 'Restricted to adults. Australia',
  },
  {
    value: 'RC',
    label: 'RC',
    description: 'Refused classification. Australia',
  },
  {
    value: 'FSK 0',
    label: 'FSK 0',
    description: 'No age restriction. Germany',
  },
  { value: 'FSK 6', label: 'FSK 6', description: '6 and over. Germany' },
  { value: 'FSK 12', label: 'FSK 12', description: '12 and over. Germany' },
  { value: 'FSK 16', label: 'FSK 16', description: '16 and over. Germany' },
  { value: 'FSK 18', label: 'FSK 18', description: 'Adults only. Germany' },
  {
    value: 'PG12',
    label: 'PG12',
    description: 'Parental guidance under 12. Japan',
  },
  {
    value: 'R13',
    label: 'R13',
    description: 'Restricted to 13 and over. New Zealand',
  },
  {
    value: 'R15',
    label: 'R15',
    description: 'Restricted to 15 and over. New Zealand',
  },
  {
    value: 'R16',
    label: 'R16',
    description: 'Restricted to 16 and over. New Zealand',
  },
  {
    value: 'RP13',
    label: 'RP13',
    description: 'Under 13 with a parent or guardian. New Zealand',
  },
  {
    value: 'RP16',
    label: 'RP16',
    description: 'Under 16 with a parent or guardian. New Zealand',
  },
  {
    value: 'Not Rated',
    label: 'Not Rated',
    description: 'Not rated. Any region',
  },
  { value: 'Unrated', label: 'Unrated', description: 'Unrated. Any region' },
  { value: 'Exempt', label: 'Exempt', description: 'Exempt. Any region' },
  { value: 'Banned', label: 'Banned', description: 'Banned. Any region' },
]

export const MOVIE_STATUS_OPTIONS: ConditionOption[] = [
  { value: 'tba', label: 'TBA' },
  { value: 'announced', label: 'Announced' },
  { value: 'inCinemas', label: 'In cinemas' },
  { value: 'released', label: 'Released' },
  { value: 'deleted', label: 'Deleted' },
]

export const SERIES_STATUS_OPTIONS: ConditionOption[] = [
  { value: 'continuing', label: 'Continuing' },
  { value: 'ended', label: 'Ended' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'deleted', label: 'Deleted' },
]

/** Options per source, a source still loading or not needed yet is an empty list. */
export type ConditionOptions = Record<OptionSource, ConditionOption[]>

/** The option label for a stored value, or the value itself when no option carries it. */
export function optionLabel(
  options: readonly ConditionOption[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value
}
