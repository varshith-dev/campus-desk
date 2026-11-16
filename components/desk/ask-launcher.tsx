'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const SUGGESTIONS = ['Is my Wednesday class on?', 'When is the tuition fee due, and what is the late fee?', 'Any new notices about exams?', 'Is the library open late during exams?'];

export function AskLauncher() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const go = (text: string) => router.push(`/ask?q=${encodeURIComponent(text)}&go=1`);
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(q.trim());
        }}
        className="flex items-center gap-2 rounded-xl border-2 border-foreground/80 bg-card p-1.5 shadow-[4px_4px_0_0_var(--foreground)] focus-within:ring-2 focus-within:ring-ring"
      >
        <label htmlFor="launcher" className="sr-only">
          Ask Campus Desk a question
        </label>
        <input id="launcher" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask in plain words, for example: is my class on today?" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground/80" autoComplete="off" maxLength={300} />
        <Button type="submit" className="gap-1.5" disabled={!q.trim()}>
          Ask <ArrowRight className="size-4" />
        </Button>
      </form>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Try one of these">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button type="button" onClick={() => go(s)} className="rounded-full border bg-card/70 px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
