import { cn } from 'cn';
import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { type AlertVariant, CALLOUT_VARIANTS, isCalloutType } from '@/lib/callout';

const ICONS: Record<AlertVariant, LucideIcon> = {
  info: Info,
  warn: TriangleAlert,
  destructive: CircleAlert,
  default: CircleCheck,
};

interface CalloutContainerProps extends ComponentProps<'div'> {
  type?: string;
}

export function CalloutContainer({ type = 'info', className, children, ...props }: CalloutContainerProps) {
  const variant = isCalloutType(type) ? CALLOUT_VARIANTS[type] : 'info';
  const Icon = ICONS[variant];

  return (
    <Alert variant={variant} className={cn('my-4', className)} {...props}>
      <Icon aria-hidden />
      {children}
    </Alert>
  );
}

export function CalloutDescription({ className, ...props }: ComponentProps<'div'>) {
  return <AlertDescription className={cn('prose-no-margin', className)} {...props} />;
}
