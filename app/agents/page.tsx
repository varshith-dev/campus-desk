import type { Metadata } from 'next';
import { AgentsClient } from '@/components/agents/agents-client';
import { PageHeader } from '@/components/desk/bits';

export const metadata: Metadata = { title: 'For agents' };

export default function AgentsPage() {
  return (
    <div>
      <PageHeader eyebrow="Open agentic web, MVP profile 0.2" title="How other sites and agents use this desk.">
        Campus Desk publishes files, and the browser does the work. A caller site can run the agents in its own page, or ask a student for a grant to call the live tools.
      </PageHeader>
      <AgentsClient peerUrl={process.env.NEXT_PUBLIC_PEER_URL ?? 'http://localhost:5174'} />
    </div>
  );
}
