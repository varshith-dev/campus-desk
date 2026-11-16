import type { Metadata } from 'next';
import { NoticeBoard } from '@/components/desk/notice-board';
import { PageHeader } from '@/components/desk/bits';
import { pageContext } from '@/lib/page-data';

export const metadata: Metadata = { title: 'Notices' };

export default async function NoticesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, profile } = await pageContext(await searchParams);
  return (
    <div>
      <PageHeader eyebrow={`Year ${profile.year} · ${data.notices.length} notices on the board`} title="The notice board, searchable.">
        Newest first. Turn on all years to see notices meant for other years too.
      </PageHeader>
      <NoticeBoard notices={data.notices.map((n) => ({ ...n }))} year={profile.year} />
    </div>
  );
}
