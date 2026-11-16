'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Profile } from '@/src/data/model';

export interface ProfileOptions {
  years: number[];
  sections: string[];
  feeCategories: Array<{ id: string; label: string }>;
}

/** The three private settings. They are saved on the server, in the student's own record. */
export function ProfileSwitcher({ profile, options, label = 'Your class' }: { profile: Profile; options: ProfileOptions; label?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(profile);
  const [pending, start] = useTransition();

  async function save(next: Profile) {
    setValue(next);
    const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    if (!res.ok) {
      toast.error('Could not save your class. Try again.');
      setValue(profile);
      return;
    }
    start(() => router.refresh());
  }

  const field = (id: string, text: string, current: string, items: Array<{ v: string; t: string }>, on: (v: string) => void) => (
    <label className="flex items-center gap-2 text-xs text-muted-foreground" htmlFor={id}>
      <span className="eyebrow">{text}</span>
      <Select value={current} onValueChange={on}>
        <SelectTrigger id={id} size="sm" className="h-8 min-w-[4.5rem] bg-card text-sm text-foreground" aria-label={text}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.v} value={i.v}>
              {i.t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );

  return (
    <form aria-label={`${label}. Saved to your record on this site.`} onSubmit={(e) => e.preventDefault()} aria-busy={pending} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-display text-sm font-semibold">{label}</span>
      {field('p-year', 'Year', String(value.year), options.years.map((y) => ({ v: String(y), t: `Year ${y}` })), (v) => save({ ...value, year: Number(v) }))}
      {field('p-section', 'Section', value.section, options.sections.map((s) => ({ v: s, t: `Section ${s}` })), (v) => save({ ...value, section: v }))}
      {field('p-fee', 'Fee category', value.feeCategory, options.feeCategories.map((c) => ({ v: c.id, t: c.label })), (v) => save({ ...value, feeCategory: v }))}
    </form>
  );
}
