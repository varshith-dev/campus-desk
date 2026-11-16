import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const CATEGORY: Record<string, { label: string; tone: string }> = {
  exams: { label: 'Exams', tone: 'bg-brick/15 text-[#7f2a1b] dark:text-[#f4a08c] border-brick/40' },
  fees: { label: 'Fees', tone: 'bg-mustard/25 text-[#7a5200] dark:text-[#f2c45a] border-mustard/60' },
  academic: { label: 'Academic', tone: 'bg-pencil/15 text-[#245a75] dark:text-pencil border-pencil/40' },
  events: { label: 'Events', tone: 'bg-sage/20 text-[#3d5a3a] dark:text-[#b2d0ac] border-sage/50' },
  placement: { label: 'Placement', tone: 'bg-chalk/10 text-foreground border-foreground/30' },
  admin: { label: 'Office', tone: 'bg-muted text-muted-foreground border-border' },
};

export function CategoryTag({ category, className }: { category: string; className?: string }) {
  const c = CATEGORY[category] ?? { label: category, tone: 'bg-muted text-muted-foreground border-border' };
  return <span className={cn('inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[0.68rem] font-medium uppercase tracking-wider', c.tone, className)}>{c.label}</span>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 max-w-3xl">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h1 className="text-balance text-4xl font-semibold leading-[1.05] sm:text-5xl">{title}</h1>
      {children && <div className="mt-3 text-pretty text-lg text-muted-foreground">{children}</div>}
    </header>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border-2 border-dashed border-border bg-card/40 px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-md text-muted-foreground">{children}</div>}
    </div>
  );
}

export function DaysLeft({ days, className }: { days: number; className?: string }) {
  const text = days < 0 ? `${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  return <span className={cn('mono', className)}>{text}</span>;
}

export function StatusPill({ status }: { status: 'on' | 'cancelled' | 'moved' }) {
  if (status === 'on') return null;
  return <span className={cn('rounded-sm px-1.5 py-0.5 font-mono text-[0.68rem] font-medium uppercase tracking-wider', status === 'cancelled' ? 'bg-destructive/15 text-[#9a1f18] dark:text-[#ff9b92]' : 'bg-mustard/30 text-[#7a5200] dark:text-mustard')}>{status === 'cancelled' ? 'Cancelled' : 'Changed'}</span>;
}
