import type { Metadata } from 'next';
import { PageHeader } from '@/components/desk/bits';
import { RemindersClient } from '@/components/desk/reminders-client';
import { peekStudent } from '@/lib/http';
import { listReminders } from '@/lib/store';

export const metadata: Metadata = { title: 'Reminders' };

export default async function RemindersPage() {
  const { db, student } = await peekStudent();
  const saved = student ? await listReminders(db, student.id, 'saved') : [];
  const pending = student ? await listReminders(db, student.id, 'pending') : [];
  return (
    <div>
      <PageHeader eyebrow="Saved on the server, in your own record" title="Reminders you confirmed.">
        Nothing lands here unless you said yes. An agent can propose a reminder, but it waits in the box below until you confirm it.
      </PageHeader>
      <RemindersClient initialSaved={saved} initialPending={pending} signedIn={student?.kind === 'account'} name={student?.name ?? ''} />
    </div>
  );
}
