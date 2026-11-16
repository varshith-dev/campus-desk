import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AskClient } from '@/components/ask/ask-client';
import { PageHeader } from '@/components/desk/bits';
import { Skeleton } from '@/components/ui/skeleton';
import { pageContext } from '@/lib/page-data';
import { toolCatalog } from '@/src/site/catalog';

export const metadata: Metadata = { title: 'Ask' };

export default async function AskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, profile, today, now } = await pageContext(await searchParams);
  const o = data.department.office;
  return (
    <div>
      <PageHeader eyebrow="Ask the department agents" title="Ask in plain words.">
        A front desk agent hands your question to a timetable, notices, or fees and exams agent. You can see every step on the right.
      </PageHeader>
      <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-xl" />}>
        <AskClient today={today} now={now} office={`${o.place}, ${o.hours}, ${o.email}.`} profile={profile} catalog={toolCatalog(data.department)} clockOverride={now !== data.department.sample_now ? now : null} />
      </Suspense>
    </div>
  );
}
