'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, BookOpenCheck, CalendarDays, CircleUserRound, Home, LogOut, Megaphone, Menu, MessageCircle, Moon, ScrollText, Share2, Sun, Wallet } from 'lucide-react';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export const PRIMARY = [
  { href: '/', label: 'Today', icon: Home },
  { href: '/timetable', label: 'Timetable', icon: CalendarDays },
  { href: '/notices', label: 'Notices', icon: Megaphone },
  { href: '/fees-exams', label: 'Fees and exams', short: 'Fees', icon: Wallet },
  { href: '/ask', label: 'Ask', icon: MessageCircle },
] as const;

const MORE = [
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/activity', label: 'Agent activity', icon: ScrollText },
  { href: '/agents', label: 'For agents', icon: Share2 },
  { href: '/verify', label: 'Verify a receipt', icon: BookOpenCheck },
] as const;

const active = (path: string, href: string) => (href === '/' ? path === '/' : path.startsWith(href));

export function DesktopNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {PRIMARY.map((n) => (
        <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? 'page' : undefined} className={cn('relative rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', active(path, n.href) && 'text-foreground')}>
          {n.label}
          {active(path, n.href) && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-primary" />}
        </Link>
      ))}
    </nav>
  );
}

export function UtilityNav({ pending, signedIn, name }: { pending: number; signedIn: boolean; name: string }) {
  const path = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  async function signOut() {
    await fetch('/api/auth/sign-out', { method: 'POST' });
    router.push('/');
    router.refresh();
  }
  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="ghost" size="icon" className="relative hidden sm:inline-flex" aria-label="Reminders">
        <Link href="/reminders">
          <Bell className="size-4" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="relative" aria-label={pending ? `Agent activity, ${pending} waiting for you` : 'Agent activity'}>
        <Link href="/activity" aria-current={path.startsWith('/activity') ? 'page' : undefined}>
          <ScrollText className="size-4" />
          {pending > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-primary font-mono text-[0.6rem] text-primary-foreground">{pending}</span>}
        </Link>
      </Button>
      <Button variant="ghost" size="icon" aria-label="Switch between light and dark" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
      </Button>
      {signedIn ? (
        <Button variant="outline" size="sm" className="ml-1 hidden gap-2 sm:inline-flex" onClick={signOut} aria-label={`Sign out ${name}`}>
          <span className="max-w-[8rem] truncate">{name.split(' ')[0]}</span>
          <LogOut className="size-3.5" />
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm" className="ml-1 hidden gap-1.5 sm:inline-flex">
          <Link href="/sign-in">
            <CircleUserRound className="size-3.5" /> Sign in
          </Link>
        </Button>
      )}
    </div>
  );
}

/** Phone layout: a bar of the main pages at the bottom, and a sheet for the rest. */
export function MobileBar({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-6">
        {PRIMARY.map((n) => {
          const on = active(path, n.href);
          return (
            <li key={n.href}>
              <Link href={n.href} aria-current={on ? 'page' : undefined} className={cn('flex flex-col items-center gap-0.5 py-2 text-[0.68rem] font-medium', on ? 'text-primary' : 'text-muted-foreground')}>
                <n.icon className="size-5" />
                {'short' in n ? n.short : n.label}
              </Link>
            </li>
          );
        })}
        <li>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="flex w-full flex-col items-center gap-0.5 py-2 text-[0.68rem] font-medium text-muted-foreground" aria-label="More pages">
              <Menu className="size-5" />
              More
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-xl pb-8">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <ul className="grid gap-1 px-4">
                {[...MORE, ...(signedIn ? [] : [{ href: '/sign-in', label: 'Sign in', icon: CircleUserRound }])].map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-3 text-base hover:bg-muted">
                      <n.icon className="size-5 text-primary" /> {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
