import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import './globals.css';
import { Brand } from '@/components/desk/brand';
import { DesktopNav, MobileBar, UtilityNav } from '@/components/desk/site-nav';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { pendingRequests } from '@/lib/grants';
import { peekStudent } from '@/lib/http';
import { loadCampusData } from '@/lib/store';

export const metadata: Metadata = {
  title: { default: 'Campus Desk', template: '%s | Campus Desk' },
  description: 'A college department website that other agents can use. Students ask in plain words, and approved sites can run the same agents. Sample data for a made-up department.',
  icons: { icon: '/favicon.svg' },
  alternates: { types: { 'application/json': '/agent-manifest.json' } },
};
export const viewport: Viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f4efe4' }, { media: '(prefers-color-scheme: dark)', color: '#121b19' }], width: 'device-width', initialScale: 1 };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const { db, student } = await peekStudent();
  const data = await loadCampusData(db);
  const pending = student ? (await pendingRequests(db, student.id)).length : 0;
  const d = data.department;
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce} disableTransitionOnChange>
          <TooltipProvider delayDuration={150}>
            <a className="skip" href="#main">
              Skip to the main content
            </a>
            <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
              <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
                <Brand sub={`${d.short}, ${d.semester}`} />
                <DesktopNav />
                <UtilityNav pending={pending} signedIn={student?.kind === 'account'} name={student?.name ?? ''} />
              </div>
            </header>
            <div className="border-b bg-secondary/60">
              <p className="mx-auto max-w-6xl px-4 py-1.5 text-xs text-muted-foreground">
                <span className="stamp mr-2 text-primary">Sample data</span>
                {d.disclaimer}
              </p>
            </div>
            <main id="main" tabIndex={-1} className="mx-auto min-h-[70vh] max-w-6xl px-4 pb-28 pt-8 outline-none lg:pb-16">
              {children}
            </main>
            <footer className="border-t bg-card/50 pb-24 lg:pb-0">
              <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 text-sm text-muted-foreground sm:grid-cols-[1.4fr_1fr]">
                <p>Campus Desk is open source (Apache 2.0). It follows the Open Agentic Web minimum profile: a published manifest, a data-only agent network, a browser runtime and bring-your-own-key model settings.</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs sm:justify-end">
                  <li>
                    <a className="underline-offset-4 hover:underline" href="/agent-manifest.json">
                      agent-manifest.json
                    </a>
                  </li>
                  <li>
                    <a className="underline-offset-4 hover:underline" href="/campus_desk.network.json">
                      campus_desk.network.json
                    </a>
                  </li>
                  <li>
                    <Link className="underline-offset-4 hover:underline" href="/agents">
                      How other sites call it
                    </Link>
                  </li>
                </ul>
              </div>
            </footer>
            <MobileBar signedIn={student?.kind === 'account'} />
            <Toaster position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
