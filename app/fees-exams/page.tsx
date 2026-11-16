import type { Metadata } from 'next';
import { Clock, MapPin } from 'lucide-react';
import { DaysLeft, PageHeader } from '@/components/desk/bits';
import { Item, Reveal, Stagger } from '@/components/desk/motion';
import { ProfileSwitcher } from '@/components/desk/profile-switcher';
import { pageContext } from '@/lib/page-data';
import { examDates, feeDates, formatDate, money } from '@/src/data/model';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Fees and exams' };

export default async function FeesExamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, profile, today } = await pageContext(await searchParams);
  const fees = feeDates(data, profile.year, profile.feeCategory, today);
  const exams = examDates(data, profile.year, today);
  const cat = data.department.fee_categories.find((c) => c.id === profile.feeCategory)?.label ?? profile.feeCategory;
  return (
    <div className="space-y-12">
      <PageHeader eyebrow={`Year ${profile.year} · ${cat} fees`} title="What to pay, and when you sit.">
        Amounts follow your fee category. Campus Desk shows dates and amounts only. It cannot take payments or register you for exams.
      </PageHeader>
      <div className="rounded-lg border bg-card/70 px-4 py-3">
        <ProfileSwitcher profile={profile} options={{ years: data.department.years, sections: data.department.sections, feeCategories: data.department.fee_categories }} />
      </div>

      <section aria-labelledby="fees-h">
        <h2 id="fees-h" className="mb-4 text-3xl font-semibold">
          Fees
        </h2>
        <Stagger className="grid gap-5 md:grid-cols-2">
          {fees.map((f) => (
            <Item key={f.id}>
              <article className={cn('ticket flex h-full flex-col rounded-xl border bg-card p-6', f.daysLeft < 0 && 'opacity-60')}>
                <header className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-semibold leading-snug">{f.name}</h3>
                  <span className={cn('stamp shrink-0', f.daysLeft < 0 ? 'text-muted-foreground' : f.daysLeft <= 14 ? 'text-brick' : 'text-sage')}>{f.daysLeft < 0 ? 'Past due date' : f.daysLeft <= 14 ? 'Due soon' : 'Open'}</span>
                </header>
                <p className="mono mt-4 text-5xl font-semibold tracking-tight">{money(data, f.amount)}</p>
                <p className="mt-2">
                  Due <strong>{formatDate(f.due)}</strong>, <DaysLeft days={f.daysLeft} />
                </p>
                <p className="mt-3 border-t border-dashed pt-3 text-sm text-muted-foreground">
                  Late fee {money(data, f.lateFeePerDay)} a day, up to {money(data, f.lateFeeCap)}. {f.note}
                </p>
              </article>
            </Item>
          ))}
        </Stagger>
      </section>

      <section aria-labelledby="exams-h">
        <h2 id="exams-h" className="mb-1 text-3xl font-semibold">
          Exams
        </h2>
        <p className="mb-5 text-muted-foreground">
          Hall tickets from <strong className="text-foreground">{formatDate(data.exams.hall_ticket_release)}</strong> at the department office. {data.exams.rules}
        </p>
        <Reveal>
          <ol className="relative space-y-4 border-l-2 border-dashed border-foreground/30 pl-6">
            {exams.map((e) => (
              <li key={e.course + e.date} className="relative">
                <span aria-hidden className="absolute -left-[1.95rem] top-3 size-3 rounded-full border-2 border-background bg-primary" />
                <article className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
                  <p className="mono text-sm">
                    <span className="block font-semibold">{formatDate(e.date)}</span>
                    <span className="text-muted-foreground">
                      <DaysLeft days={e.daysLeft} />
                    </span>
                  </p>
                  <div>
                    <h3 className="text-lg font-semibold leading-snug">{e.name}</h3>
                    <p className="mono text-xs text-muted-foreground">
                      {e.course} · {e.type}
                    </p>
                  </div>
                  <p className="mono flex gap-4 text-sm text-muted-foreground sm:flex-col sm:gap-0.5 sm:text-right">
                    <span className="inline-flex items-center gap-1.5 sm:justify-end">
                      <Clock className="size-3.5" /> {e.start} to {e.end}
                    </span>
                    <span className="inline-flex items-center gap-1.5 sm:justify-end">
                      <MapPin className="size-3.5" /> {e.venue}
                    </span>
                  </p>
                </article>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>
    </div>
  );
}
