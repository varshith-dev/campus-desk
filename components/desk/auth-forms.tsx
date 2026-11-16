'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ProfileOptions } from '@/components/desk/profile-switcher';

export function AuthForms({ options, demo }: { options: ProfileOptions; demo: { email: string; password: string } | null }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState({ email: '', password: '' });
  const [up, setUp] = useState({ name: '', email: '', password: '', year: String(options.years[0] ?? 2), section: options.sections[0] ?? 'A', feeCategory: options.feeCategories[0]?.id ?? 'general' });

  async function submit(path: string, body: unknown) {
    setBusy(true);
    setError('');
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json();
    setBusy(false);
    if (!res.ok) return setError(out?.error?.message ?? 'Something went wrong. Try again.');
    router.push('/');
    router.refresh();
  }

  return (
    <Tabs defaultValue="in">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="in">Sign in</TabsTrigger>
        <TabsTrigger value="up">Create account</TabsTrigger>
      </TabsList>
      <TabsContent value="in">
        <form
          className="space-y-4 rounded-xl border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit('/api/auth/sign-in', signIn);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="si-email">Email</Label>
            <Input id="si-email" type="email" autoComplete="username" required value={signIn.email} onChange={(e) => setSignIn({ ...signIn, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-pw">Passphrase</Label>
            <Input id="si-pw" type="password" autoComplete="current-password" required value={signIn.password} onChange={(e) => setSignIn({ ...signIn, password: e.target.value })} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </Button>
          {demo && (
            <div className="rounded-lg border border-dashed bg-secondary/50 p-3 text-sm">
              <p className="font-medium">Try the sample student</p>
              <p className="mono mt-1 text-xs text-muted-foreground">
                {demo.email} / {demo.password}
              </p>
              <Button type="button" variant="link" className="h-auto p-0 text-sm text-[#9a3220] dark:text-[#f4a08c]" onClick={() => setSignIn(demo)}>
                Fill it in
              </Button>
            </div>
          )}
        </form>
      </TabsContent>
      <TabsContent value="up">
        <form
          className="space-y-4 rounded-xl border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit('/api/auth/sign-up', { ...up, year: Number(up.year) });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="su-name">Name</Label>
            <Input id="su-name" autoComplete="name" required minLength={2} maxLength={60} value={up.name} onChange={(e) => setUp({ ...up, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="su-email">Email</Label>
            <Input id="su-email" type="email" autoComplete="email" required value={up.email} onChange={(e) => setUp({ ...up, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="su-pw">Passphrase (at least 10 characters)</Label>
            <Input id="su-pw" type="password" autoComplete="new-password" required minLength={10} value={up.password} onChange={(e) => setUp({ ...up, password: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Year', 'su-year', up.year, options.years.map((y) => [String(y), `Year ${y}`]), (v: string) => setUp({ ...up, year: v })],
              ['Section', 'su-sec', up.section, options.sections.map((s) => [s, s]), (v: string) => setUp({ ...up, section: v })],
              ['Fees', 'su-fee', up.feeCategory, options.feeCategories.map((c) => [c.id, c.label]), (v: string) => setUp({ ...up, feeCategory: v })],
            ].map(([label, id, value, items, on]) => (
              <div key={id as string} className="space-y-1.5">
                <Label htmlFor={id as string}>{label as string}</Label>
                <Select value={value as string} onValueChange={on as (v: string) => void}>
                  <SelectTrigger id={id as string} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(items as string[][]).map(([v, t]) => (
                      <SelectItem key={v} value={v!}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Creating...' : 'Create account'}
          </Button>
          <p className="text-xs text-muted-foreground">This is a sample site for a made-up department. Use a throwaway passphrase.</p>
        </form>
      </TabsContent>
    </Tabs>
  );
}
