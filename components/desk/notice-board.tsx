'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarClock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY, CategoryTag, EmptyState } from '@/components/desk/bits';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatDate, type Notice } from '@/src/data/model';

export function NoticeBoard({ notices, year }: { notices: Notice[]; year: number }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [all, setAll] = useState(false);
  const reduce = useReducedMotion();
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return notices
      .filter((n) => (all || n.years.includes(year)) && (!cat || n.category === cat) && words.every((w) => `${n.title} ${n.body} ${n.category}`.toLowerCase().includes(w)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [notices, q, cat, all, year]);

  return (
    <div>
      <form onSubmit={(e) => e.preventDefault()} role="search" aria-label="Filter notices" className="mb-6 flex flex-col gap-3 rounded-lg border bg-card/70 p-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notices, for example: fee, project, library" className="bg-background pl-9" aria-label="Search notices" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          {[['', 'All'], ...Object.entries(CATEGORY).map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k!)} className={cn('rounded-full border px-3 py-1 text-sm transition-colors', cat === k ? 'border-foreground bg-foreground text-background' : 'bg-card text-muted-foreground hover:border-primary hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={all} onCheckedChange={setAll} aria-label="Show notices for all years" /> All years
        </label>
      </form>

      <p className="mb-3 text-sm text-muted-foreground" role="status" aria-live="polite">
        {shown.length} notice{shown.length === 1 ? '' : 's'}
      </p>
      {shown.length === 0 ? (
        <EmptyState title="Nothing matches that." icon={<Search className="size-8" />}>
          Try fewer words, pick All, or turn on all years.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {shown.map((n, i) => (
              <motion.li key={n.id} id={n.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, scale: 0.97 }} transition={{ duration: 0.25, delay: Math.min(i, 6) * 0.03 }} className="scroll-mt-24 target:ring-2 target:ring-primary">
                <article className="relative h-full rounded-lg border bg-card p-5 shadow-[3px_3px_0_0_var(--border)]">
                  <span aria-hidden className="absolute -top-2 left-5 size-3 rounded-full bg-brick shadow-[0_2px_0_rgba(0,0,0,.25)]" />
                  <header className="mb-2 flex flex-wrap items-center gap-2">
                    <CategoryTag category={n.category} />
                    <span className="mono text-xs text-muted-foreground">{formatDate(n.date)}</span>
                    <span className="mono ml-auto text-xs text-muted-foreground">Year {n.years.join(' and ')}</span>
                  </header>
                  <h2 className="text-xl font-semibold leading-snug">{n.title}</h2>
                  <p className="mt-2 text-pretty text-muted-foreground">{n.body}</p>
                  {n.deadline && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-mustard/20 px-2 py-1 text-sm font-medium">
                      <CalendarClock className="size-4" /> Remember {formatDate(n.deadline)}
                    </p>
                  )}
                </article>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
