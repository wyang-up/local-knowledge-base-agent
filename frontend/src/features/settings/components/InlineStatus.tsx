import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export type StatusTone = 'success' | 'error' | 'warning' | 'info';

interface InlineStatusProps {
  tone: StatusTone;
  message: string;
  testId?: string;
}

const toneClassMap: Record<StatusTone, string> = {
  success: 'border-green-200 bg-green-50 text-green-700',
  error: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

const iconMap: Record<StatusTone, React.ReactNode> = {
  success: <CheckCircle2 size={14} />,
  error: <AlertCircle size={14} />,
  warning: <AlertCircle size={14} />,
  info: <Info size={14} />,
};

export default function InlineStatus({ tone, message, testId }: InlineStatusProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${toneClassMap[tone]}`}
      data-testid={testId}
      role="status"
    >
      {iconMap[tone]}
      <span>{message}</span>
    </div>
  );
}
