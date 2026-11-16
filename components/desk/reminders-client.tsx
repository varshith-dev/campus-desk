'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BellRing, CalendarPlus, Check, Download, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/desk/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/src/data/model';

interface R {
  id: string;
  title: string;
  date: string;
  time?: string;
  note?: string;
  source: string;
}

export function RemindersClient({ initialSaved, initialPending, signedIn, name }: { initialSaved: R[]; initialPending: R[]; signedIn: boolean; name: string }) {
  const reduce = useReducedMotion();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(initialPending);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', date: '2026-11-27', time: '', note: '' });
  const [error, setError] = useState('');

  const sort = (l: R[]) => [...l].sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`));
  async function reload() {
    const r = await (await fetch('/api/reminders')).json();
    setSaved(r.saved);
    setPending(r.pending);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body?.error?.message ?? 'Could not save that.');
    setSaved((p) => sort([...p.filter((x) => x.id !== body.reminder.id), body.reminder]));
    setForm({ ...form, title: '', note: '' });
    toast.success('Saved.');
  }
  async function decide(id: string, decision: 'saved' | 'declined') {
    const res = await fetch(`/api/reminders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
    if (!res.ok) return toast.error('That proposal is no longer waiting.');
    toast(decision === 'saved' ? 'Confirmed and saved.' : 'Declined.');
    await reload();
  }
  async function remove(id: string) {
    const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    if (res.ok) setSaved((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-8">
        {pending.length > 0 && (
          <section aria-labelledby="pend-h" className="rounded-xl border-2 border-mustard bg-mustard/10 p-5" data-testid="pending">
            <h2 id="pend-h" className="flex items-center gap-2 text-2xl font-semibold">
              <BellRing className="size-5" /> Waiting for your yes
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">An outside agent proposed these. They are not saved yet.</p>
            <ul className="space-y-2">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.title}</p>
                    <p className="mono text-xs text-muted-foreground">
                      {formatDate(r.date)}
                      {r.time ? ` ${r.time}` : ''} · from {r.source}
                    </p>
                  </div>
                  <Button size="sm" className="gap-1.5" onClick={() => decide(r.id, 'saved')}>
                    <Check className="size-3.5" /> Confirm
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => decide(r.id, 'declined')}>
                    <X className="size-3.5" /> Decline
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="saved-h">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="saved-h" className="text-2xl font-semibold">
              Saved
            </h2>
            {saved.length > 0 && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href="/api/reminders/ics" download>
                  <Download className="size-3.5" /> Calendar file
                </a>
              </Button>
            )}
          </div>
          {saved.length === 0 ? (
            <EmptyState title="No reminders yet." icon={<CalendarPlus className="size-8" />}>
              Add one here, or ask the agent: &ldquo;Remind me to pay the tuition fee on 27 Nov&rdquo;. It will ask you to confirm.
            </EmptyState>
          ) : (
            <ul className="space-y-2" aria-label="Saved reminders">
              <AnimatePresence initial={false}>
                {saved.map((r) => (
                  <motion.li key={r.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12 }} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                    <span className="mono grid w-14 place-items-center rounded-md bg-secondary py-1 text-center text-xs leading-tight">
                      <span className="text-lg font-semibold">{Number(r.date.slice(8))}</span>
                      <span className="uppercase text-muted-foreground">{formatDate(r.date).split(' ')[2]}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.title}</p>
                      <p className="mono text-xs text-muted-foreground">
                        {formatDate(r.date)}
                        {r.time ? ` at ${r.time}` : ''}
                        {r.note ? ` · ${r.note}` : ''}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Remove reminder ${r.title}`} onClick={() => remove(r.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <form onSubmit={add} className="space-y-3 rounded-xl border bg-card p-5" aria-label="Add a reminder">
          <h2 className="text-xl font-semibold">Add one yourself</h2>
          <div className="space-y-1.5">
            <Label htmlFor="r-title">What</Label>
            <Input id="r-title" required maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Pay tuition installment 2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-date">Date</Label>
              <Input id="r-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-time">Time (optional)</Label>
              <Input id="r-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-note">Note (optional)</Label>
            <Input id="r-note" maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !form.title.trim()} className="w-full">
            {busy ? 'Saving...' : 'Save reminder'}
          </Button>
        </form>
        <div className="rounded-xl border bg-secondary/50 p-5 text-sm">
          {signedIn ? (
            <p>
              Signed in as <strong>{name}</strong>. Your reminders follow you to any device.
            </p>
          ) : (
            <p>
              You are using a guest desk. Reminders stay with this browser for 30 days.{' '}
              <Link href="/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>{' '}
              to keep them on any device.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
