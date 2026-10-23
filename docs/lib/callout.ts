import type { ComponentProps } from 'react';
import type { Alert } from '@/components/ui/alert';

export type AlertVariant = NonNullable<ComponentProps<typeof Alert>['variant']>;

export const CALLOUT_VARIANTS = {
  important: 'warn',
  info: 'info',
  note: 'info',
  tip: 'info',
  warning: 'destructive',
  danger: 'destructive',
  caution: 'destructive',
  success: 'default',
} as const satisfies Record<string, AlertVariant>;

export type CalloutType = keyof typeof CALLOUT_VARIANTS;

export function isCalloutType(type: string): type is CalloutType {
  return Object.hasOwn(CALLOUT_VARIANTS, type);
}
