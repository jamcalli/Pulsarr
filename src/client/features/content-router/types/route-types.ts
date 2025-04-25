import type { ConditionValue } from '@/features/content-router/schemas/content-router.schema'

/**
 * Types for the conditional route query builder.
 * These types define the structure of conditions and condition groups
 * used in the content router's conditional evaluator.
 */

/**
 * Base interface for conditions and condition groups
 */
export interface ConditionBase {
  /** Whether to negate the condition (NOT) */
  negate?: boolean
}

/**
 * Represents a single condition in a query
 */
export interface Condition extends ConditionBase {
  /** The field to evaluate (genre, year, language, user, etc.) */
  field: ConditionField

  /** The operator to apply (equals, contains, in, etc.) */
  operator: ComparisonOperator

  /** The value to compare against */
  value: ConditionValue
}

/**
 * Represents a group of conditions combined with a logical operator
 */
export interface ConditionGroup extends ConditionBase {
  /** The logical operator to combine conditions (AND/OR) */
  operator: 'AND' | 'OR'

  /** The list of conditions or nested groups */
  conditions: Array<Condition | ConditionGroup>
}

/**
 * Determines whether a given object is a {@link Condition}.
 *
 * Returns true if the object contains the required properties for a {@link Condition}; otherwise, returns false.
 *
 * @param obj - The object to check.
 * @returns True if {@link obj} is a {@link Condition}.
 */
export function isCondition(obj: unknown): obj is Condition {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    'field' in obj &&
    'operator' in obj &&
    'value' in obj
  )
}

/**
 * Determines whether a value is a {@link ConditionGroup}.
 *
 * Returns true if the input is an object with an 'operator' property and a 'conditions' array.
 *
 * @param obj - The value to test.
 * @returns True if {@link obj} is a {@link ConditionGroup}; otherwise, false.
 */
export function isConditionGroup(obj: unknown): obj is ConditionGroup {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === 'object' &&
    'operator' in obj &&
    'conditions' in obj &&
    Array.isArray((obj as Record<string, unknown>).conditions)
  )
}

/**
 * Types of condition operators
 */
export type ComparisonOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'in'
  | 'notIn'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'regex'

/**
 * Fields available for conditions
 */
export type ConditionField =
  | 'genre'
  | 'genres'
  | 'year'
  | 'language'
  | 'user'
  | 'userId'
  | 'userName'
  | 'certification'
  | string // Keep string union for extensibility

/**
 * Form values for a condition
 */
export interface ConditionFormValues {
  field: ConditionField
  operator: ComparisonOperator
  value: ConditionValue
  negate?: boolean
}

/**
 * Content certifications organized by region
 */

interface CertificationOption {
  value: string
  label: string
}

interface RegionCertifications {
  label: string
  movie?: CertificationOption[]
  tv?: CertificationOption[]
  all?: CertificationOption[]
}

export const ContentCertifications: Record<string, RegionCertifications> = {
  // United States
  US: {
    label: 'United States',
    movie: [
      { value: 'G', label: 'G - General Audiences' },
      { value: 'PG', label: 'PG - Parental Guidance Suggested' },
      { value: 'PG-13', label: 'PG-13 - Parents Strongly Cautioned' },
      { value: 'R', label: 'R - Restricted' },
      { value: 'NC-17', label: 'NC-17 - Adults Only' },
      { value: 'NR', label: 'NR - Not Rated' },
      { value: 'UR', label: 'UR - Unrated' },
    ],
    tv: [
      { value: 'TV-Y', label: 'TV-Y - All Children' },
      { value: 'TV-Y7', label: 'TV-Y7 - Directed to Older Children (7+)' },
      { value: 'TV-Y7-FV', label: 'TV-Y7-FV - Fantasy Violence' },
      { value: 'TV-G', label: 'TV-G - General Audience' },
      { value: 'TV-PG', label: 'TV-PG - Parental Guidance Suggested' },
      { value: 'TV-14', label: 'TV-14 - Parents Strongly Cautioned' },
      { value: 'TV-MA', label: 'TV-MA - Mature Audience Only' },
    ],
  },
  // United Kingdom
  UK: {
    label: 'United Kingdom',
    all: [
      { value: 'U', label: 'U - Universal' },
      { value: 'PG', label: 'PG - Parental Guidance' },
      { value: '12', label: '12 - Suitable for 12 and over' },
      { value: '12A', label: '12A - Suitable for 12 and over (Cinema)' },
      { value: '15', label: '15 - Suitable only for 15 and over' },
      { value: '18', label: '18 - Suitable only for adults' },
      { value: 'R18', label: 'R18 - Adult works (licensed premises only)' },
    ],
  },
  // Canada
  CA: {
    label: 'Canada',
    all: [
      { value: 'G', label: 'G - General' },
      { value: 'PG', label: 'PG - Parental Guidance' },
      { value: '14A', label: '14A - 14 Accompaniment' },
      { value: '18A', label: '18A - 18 Accompaniment' },
      { value: 'R', label: 'R - Restricted' },
      { value: 'E', label: 'E - Exempt' },
    ],
  },
  // Australia
  AU: {
    label: 'Australia',
    all: [
      { value: 'G', label: 'G - General' },
      { value: 'PG', label: 'PG - Parental Guidance' },
      { value: 'M', label: 'M - Mature' },
      { value: 'MA15+', label: 'MA15+ - Mature Accompanied' },
      { value: 'R18+', label: 'R18+ - Restricted' },
      { value: 'X18+', label: 'X18+ - Restricted to adults' },
      { value: 'RC', label: 'RC - Refused Classification' },
    ],
  },
  // Germany
  DE: {
    label: 'Germany',
    all: [
      { value: 'FSK 0', label: 'FSK 0 - Without age restriction' },
      { value: 'FSK 6', label: 'FSK 6 - Ages 6 and older' },
      { value: 'FSK 12', label: 'FSK 12 - Ages 12 and older' },
      { value: 'FSK 16', label: 'FSK 16 - Ages 16 and older' },
      { value: 'FSK 18', label: 'FSK 18 - Adults only' },
    ],
  },
  // France
  FR: {
    label: 'France',
    all: [
      { value: 'U', label: 'U - All audiences' },
      { value: '10', label: '10 - Not recommended for children under 10' },
      { value: '12', label: '12 - Not recommended for children under 12' },
      { value: '16', label: '16 - Not recommended for children under 16' },
      { value: '18', label: '18 - Prohibited for children under 18' },
    ],
  },
  // Japan
  JP: {
    label: 'Japan',
    all: [
      { value: 'G', label: 'G - General audiences' },
      { value: 'PG12', label: 'PG12 - Parental guidance for under 12' },
      { value: 'R15+', label: 'R15+ - Restricted to 15 and over' },
      { value: 'R18+', label: 'R18+ - Restricted to 18 and over' },
    ],
  },
  // New Zealand
  NZ: {
    label: 'New Zealand',
    all: [
      { value: 'G', label: 'G - General' },
      { value: 'PG', label: 'PG - Parental Guidance' },
      { value: 'M', label: 'M - Mature' },
      { value: 'R13', label: 'R13 - Restricted to 13 and over' },
      { value: 'R15', label: 'R15 - Restricted to 15 and over' },
      { value: 'R16', label: 'R16 - Restricted to 16 and over' },
      { value: 'R18', label: 'R18 - Restricted to 18 and over' },
      {
        value: 'RP13',
        label: 'RP13 - Restricted to 13 unless with parent/guardian',
      },
      {
        value: 'RP16',
        label: 'RP16 - Restricted to 16 unless with parent/guardian',
      },
    ],
  },
  // Other
  Other: {
    label: 'Other',
    all: [
      { value: 'Not Rated', label: 'Not Rated' },
      { value: 'Unrated', label: 'Unrated' },
      { value: 'Exempt', label: 'Exempt' },
      { value: 'Banned', label: 'Banned' },
    ],
  },
}

/**
 * Flattened list of all certifications for simple use cases
 */
export const AllCertifications: CertificationOption[] = Object.values(
  ContentCertifications,
).flatMap((region) => [
  ...(region.movie || []),
  ...(region.tv || []),
  ...(region.all || []),
])
