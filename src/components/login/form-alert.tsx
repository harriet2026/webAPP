'use client';

import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface FormAlertProps {
  variant: 'error' | 'success';
  children: React.ReactNode;
  'data-testid'?: string;
}

/**
 * FormAlert — icon + tinted rounded block used for every inline login
 * error/success message (prototype parity: no more bare red text).
 */
export function FormAlert({ variant, children, ...rest }: FormAlertProps) {
  const error = variant === 'error';
  const Icon = error ? AlertCircle : CheckCircle2;
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-md p-3 text-sm ${
        error ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
      }`}
      {...rest}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
