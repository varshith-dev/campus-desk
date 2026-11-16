import Link from 'next/link';
import { ArrowUpRight, CalendarClock, ShieldCheck, Ticket } from 'lucide-react';
import { AskLauncher } from '@/components/desk/ask-launcher';
import { CategoryTag, DaysLeft, StatusPill } from '@/components/desk/bits';
import { Item, Reveal, Stagger } from '@/components/desk/motion';
import { ProfileSwitcher } from '@/components/desk/profile-switcher';
import { Button } from '@/components/ui/button';
import { listLedger } from '@/lib/ledger';
import { pendingRequests } from '@/lib/grants';
import { peekStudent } from '@/lib/http';
import { pageContext } from '@/lib/page-data';
import { classesOn, feeDates, formatDate, money, nextClass, searchNotices, WEEKDAY_NAMES, weekdayOf } from '@/src/data/model';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await pageContext(await searchParams);
  const { data, profile, today, now, student } = ctx;
  const d = data.department;
  const todays = classesOn(data, today, profile.year, profile.section);
  const next = nextClass(data, now, profile.year, profile.section);
  const fees = feeDates(data, profile.year, profile.feeCategory, today).filter((f) => f.daysLeft >= 0);
  const fee = fees[0];
  const notices = searchNotices(data, { year: profile.year, limit: 3 });
  const time = now.split('T')[1] ?? '';
  const { db } = await peekStudent();
  const recent = student ? (await listLedger(db, student.id, { limit: 200 })).filter((e) => e.payload.caller && (e.payload.caller as { kind: string }).kind === 'outside') : [];
  const waiting = student ? (await pendingRequests(db, student.id)).length : 0;
  const first = student?.kind === 'account' ? student.name.split(' ')[0] : null;

  return (
    <div className="space-y-14">
      <section className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <Reveal>
          <p className="eyebrow mb-3 flex items-center gap-2">
            <CalendarClock className="size-3.5" /> {WEEKDAY_NAMES[weekdayOf(today)]}, {formatDate(today).split(' ').slice(1).join(' ')} <span aria-hidden>·</span> {time} <span className="normal-case tracking-normal">(sample clock)</span>
          </p>
          <h1 className="text-balance text-5xl font-semibold leading-[1.02] sm:text-6xl">
            {first ? `Morning, ${first}.` : 'Your department,'} <span className="text-primary">{first ? 'Here is your day.' : 'one box to ask.'}</span>
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
            The timetable, notices, fee dates and exam dates for {d.department} live in a PDF, a notice board and three group chats. Ask here, and small agents answer for your year and section. Other sites can ask too, but only after you say yes.
          </p>
          <div className="mt-6 max-w-xl">
            <AskLauncher />
          </div>
          <div className="mt-6 rounded-lg border bg-card/70 px-4 py-3">
            <ProfileSwitcher profile={profile} options={{ years: d.years, sections: d.sections, feeCategories: d.fee_categories }} />
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="chalk-panel relative overflow-hidden rounded-2xl p-6 shadow-[6px_6px_0_0_var(--brick)]">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-chalk-foreground/70">Next up</p>
            {next ? (
              <>
                <p className="mt-3 font-display text-4xl font-semibold leading-tight">{next.entry.name}</p>
                <p className="mt-1 font-mono text-sm text-chalk-foreground/80">
                  {next.entry.course} · {next.entry.faculty}
                </p>
                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-chalk-foreground/20 pt-4">
                  <div>
                    <dt className="font-mono text-[0.65rem] uppercase tracking-widest text-chalk-foreground/60">When</dt>
                    <dd className="mono text-lg">{next.date === today ? 'Today' : formatDate(next.date).split(' ').slice(0, 2).join(' ')}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[0.65rem] uppercase tracking-widest text-chalk-foreground/60">Time</dt>
                    <dd className="mono text-lg">{next.entry.start}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[0.65rem] uppercase tracking-widest text-chalk-foreground/60">Room</dt>
                    <dd className="mono text-lg">{next.entry.room}</dd>
                  </div>
                </dl>
                {next.entry.status === 'moved' && <p className="mt-4 rounded bg-mustard/20 px-3 py-2 text-sm text-mustard">{next.entry.change}</p>}
              </>
            ) : (
              <p className="mt-3 font-display text-2xl">No class in the next week.</p>
            )}
          </div>
        </Reveal>
      </section>

      <Stagger className="grid gap-5 md:grid-cols-3">
        <Item className="md:col-span-1">
          <article className="h-full rounded-xl border bg-card p-5">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">Today</h2>
              <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/timetable">
                Full week
              </Link>
            </header>
            {todays.length === 0 ? (
              <p className="text-muted-foreground">No classes are listed for today.</p>
            ) : (
              <ol className="divide-y">
                {todays.map((c) => (
                  <li key={c.start + c.course} className="flex items-start gap-3 py-2.5">
                    <span className="mono w-12 pt-0.5 text-sm text-muted-foreground">{c.start}</span>
                    <span className="min-w-0 flex-1">
                      <span className={c.status === 'cancelled' ? 'line-through decoration-destructive/70' : ''}>{c.name}</span>
                      <span className="mono block text-xs text-muted-foreground">
                        {c.course} · {c.room}
                      </span>
                      {c.change && <span className="mt-1 block text-xs text-muted-foreground">{c.change}</span>}
                    </span>
                    <StatusPill status={c.status} />
                  </li>
                ))}
              </ol>
            )}
          </article>
        </Item>

        <Item>
          <article className="ticket h-full rounded-xl border bg-card p-5">
            <header className="mb-3 flex items-center gap-2">
              <Ticket className="size-4 text-mustard" />
              <h2 className="text-xl font-semibold">Next fee</h2>
            </header>
            {fee ? (
              <>
                <p className="font-medium">{fee.name}</p>
                <p className="mono mt-1 text-4xl font-semibold tracking-tight">{money(data, fee.amount)}</p>
                <p className="mt-2 text-muted-foreground">
                  Due {formatDate(fee.due)}, <DaysLeft days={fee.daysLeft} />.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Late fee {money(data, fee.lateFeePerDay)} a day, up to {money(data, fee.lateFeeCap)}.
                </p>
                <Button asChild variant="link" className="mt-2 h-auto p-0">
                  <Link href="/fees-exams">All fees and exams</Link>
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">No fee is due soon for your category.</p>
            )}
          </article>
        </Item>

        <Item>
          <article className="h-full rounded-xl border bg-card p-5">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">Pinned notices</h2>
              <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/notices">
                All notices
              </Link>
            </header>
            <ul className="space-y-3">
              {notices.map((n, i) => (
                <li key={n.id} className="rounded-md border-l-4 bg-secondary/50 px-3 py-2" style={{ borderLeftColor: i === 0 ? 'var(--brick)' : i === 1 ? 'var(--mustard)' : 'var(--pencil)' }}>
                  <Link href={`/notices#${n.id}`} className="block">
                    <span className="mb-1 flex items-center gap-2">
                      <CategoryTag category={n.category} />
                      <span className="mono text-xs text-muted-foreground">{formatDate(n.date)}</span>
                    </span>
                    <span className="text-sm font-medium leading-snug">{n.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        </Item>
      </Stagger>

      <Reveal>
        <section aria-labelledby="agents-h" className="grid gap-6 rounded-2xl border-2 border-foreground/80 bg-card p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="eyebrow mb-2 flex items-center gap-2 text-primary">
              <ShieldCheck className="size-3.5" /> Built for the open agentic web
            </p>
            <h2 id="agents-h" className="text-3xl font-semibold leading-tight">
              Other agents can use this desk. You hold the key.
            </h2>
            <p className="mt-3 text-muted-foreground">An outside agent has to ask you first, with a pairing code only you can read out. You choose what it can read and for how long. Each call it makes lands on a signed receipt tape, and you can end its access with one tap.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/activity">
                  Open agent activity <ArrowUpRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/agents">How other sites connect</Link>
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 self-center text-center">
            {[
              ['Outside calls', String(recent.filter((e) => e.payload.type === 'tool').length)],
              ['Waiting for you', String(waiting)],
              ['Receipts signed', String(recent.length)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-secondary/70 px-2 py-4">
                <dd className="mono text-3xl font-semibold">{v}</dd>
                <dt className="eyebrow mt-1 text-[0.62rem]">{k}</dt>
              </div>
            ))}
          </dl>
        </section>
      </Reveal>
    </div>
  );
}
