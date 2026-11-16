import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, FlaskConical } from 'lucide-react';
import { PageHeader, StatusPill } from '@/components/desk/bits';
import { Item, Stagger } from '@/components/desk/motion';
import { ProfileSwitcher } from '@/components/desk/profile-switcher';
import { cn } from '@/lib/utils';
import { pageContext } from '@/lib/page-data';
import { WEEKDAYS, WEEKDAY_NAMES, addDays, classesOn, formatDate, weekdayOf, type ClassEntry } from '@/src/data/model';

export const metadata: Metadata = { title: 'Timetable' };

const TONES = ['border-brick/60 bg-brick/10', 'border-sage/70 bg-sage/15', 'border-mustard/70 bg-mustard/15', 'border-foreground/40 bg-foreground/5'];
const toneFor = (c: ClassEntry) => (c.lab ? 'border-pencil/70 bg-pencil/15' : TONES[[...c.course].reduce((s, ch) => s + ch.charCodeAt(0), 0) % TONES.length]);

export default async function TimetablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ctx = await pageContext(sp);
  const { data, profile, today } = ctx;
  const offset = Math.max(-2, Math.min(5, Number(typeof sp.week === 'string' ? sp.week : 0) || 0));
  const monday = addDays(today, -WEEKDAYS.indexOf(weekdayOf(today)) + offset * 7);
  const days = WEEKDAYS.slice(0, 6).map((w, i) => {
    const date = addDays(monday, i);
    return { w, date, classes: classesOn(data, date, profile.year, profile.section) };
  });
  const keep = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (typeof sp.now === 'string') q.set('now', sp.now);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `/timetable?${q}`;
  };
  const changes = days.flatMap((d) => d.classes.filter((c) => c.status !== 'on').map((c) => ({ date: d.date, ...c })));

  return (
    <div>
      <PageHeader eyebrow={`Year ${profile.year}, section ${profile.section} · ${data.timetable.semester}`} title="Your week, with the changes marked.">
        Cancelled and moved classes show up on the day they happen, with the reason from the department office.
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card/70 px-4 py-3">
        <ProfileSwitcher profile={profile} options={{ years: data.department.years, sections: data.department.sections, feeCategories: data.department.fee_categories }} />
        <nav aria-label="Week" className="flex items-center gap-2 text-sm">
          <Link href={keep({ week: String(offset - 1) })} className="inline-flex items-center rounded-md border bg-card px-2.5 py-1.5 hover:border-primary" aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Link>
          <span className="mono min-w-[11rem] text-center">
            {formatDate(monday).slice(4)} to {formatDate(addDays(monday, 5)).slice(4)}
          </span>
          <Link href={keep({ week: String(offset + 1) })} className="inline-flex items-center rounded-md border bg-card px-2.5 py-1.5 hover:border-primary" aria-label="Next week">
            <ChevronRight className="size-4" />
          </Link>
          {offset !== 0 && (
            <Link className="ml-1 text-primary underline-offset-4 hover:underline" href={keep({})}>
              This week
            </Link>
          )}
        </nav>
      </div>

      {changes.length > 0 && (
        <section aria-label="Changes this week" className="mb-6 rounded-lg border-l-4 border-mustard bg-mustard/10 px-4 py-3">
          <h2 className="mb-1 font-display text-lg font-semibold">Changes this week</h2>
          <ul className="space-y-1 text-sm">
            {changes.map((c) => (
              <li key={c.date + c.course}>
                <span className="mono font-medium">{formatDate(c.date).slice(0, 10)}</span> · {c.course} {c.name}: {c.change}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Stagger className="grid gap-4 lg:grid-cols-6">
        {days.map(({ w, date, classes }) => {
          const isToday = date === today;
          return (
            <Item key={date}>
              <section aria-labelledby={`day-${w}`} className={cn('h-full rounded-xl border bg-card p-3', isToday && 'border-primary ring-2 ring-primary/30')}>
                <header className="mb-3 flex items-baseline justify-between gap-2 border-b pb-2">
                  <h2 id={`day-${w}`} className="text-lg font-semibold">
                    <span className="lg:hidden">{WEEKDAY_NAMES[w]}</span>
                    <span className="hidden lg:inline">{w}</span>
                  </h2>
                  <span className={cn('mono text-xs', isToday ? 'font-semibold text-primary' : 'text-muted-foreground')}>{isToday ? 'Today' : formatDate(date).split(' ').slice(1, 3).join(' ')}</span>
                </header>
                {classes.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">No classes.</p>
                ) : (
                  <ol className="space-y-2">
                    {classes.map((c) => (
                      <li key={c.start + c.course} className={cn('rounded-md border-l-4 px-2.5 py-2', toneFor(c))}>
                        <p className="mono flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {c.start} to {c.end}
                          </span>
                          {c.lab && <FlaskConical className="size-3.5" aria-label="Lab" />}
                        </p>
                        <p className={cn('text-sm font-medium leading-snug', c.status === 'cancelled' && 'line-through decoration-destructive')}>{c.name}</p>
                        <p className="mono mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>{c.course}</span>
                          <span>{c.room}</span>
                          <StatusPill status={c.status} />
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </Item>
          );
        })}
      </Stagger>
    </div>
  );
}
