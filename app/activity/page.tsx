import type { Metadata } from 'next';
import { ActivityClient } from '@/components/activity/activity-client';
import { PageHeader } from '@/components/desk/bits';
import { listGrants, pendingRequests, TTL_CHOICES } from '@/lib/grants';
import { peekStudent } from '@/lib/http';
import { listLedger, verifyChain } from '@/lib/ledger';
import { SCOPES } from '@/lib/tools';

export const metadata: Metadata = { title: 'Agent activity' };

export default async function ActivityPage() {
  const { db, student } = await peekStudent();
  const entries = student ? await listLedger(db, student.id, { limit: 80 }) : [];
  const chain = student ? await verifyChain(db, student.id) : { ok: true, entries: 0 };
  return (
    <div>
      <PageHeader eyebrow="Receipt tape" title="Who asked, what they got, and the proof.">
        Every outside agent has to ask you first. Each call it makes, and each answer you give, becomes a signed receipt in a chain. Change one line and the chain breaks.
      </PageHeader>
      <ActivityClient
        initialEntries={entries}
        initialChain={chain}
        initialAccess={{ pairingCode: student?.pairingCode ?? null, requests: student ? await pendingRequests(db, student.id) : [], grants: student ? await listGrants(db, student.id) : [] }}
        scopes={SCOPES}
        ttlChoices={Object.keys(TTL_CHOICES)}
        peerUrl={process.env.NEXT_PUBLIC_PEER_URL ?? 'http://localhost:5174'}
      />
    </div>
  );
}
