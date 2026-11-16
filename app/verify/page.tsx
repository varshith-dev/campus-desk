import type { Metadata } from 'next';
import { PageHeader } from '@/components/desk/bits';
import { VerifyClient } from '@/components/desk/verify-client';

export const metadata: Metadata = { title: 'Verify a receipt' };

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="No account needed" title="Check a receipt yourself.">
        Paste a receipt from the tape. The check runs in this browser with the site&rsquo;s public key. It does not ask the server whether the receipt is real.
      </PageHeader>
      <VerifyClient />
    </div>
  );
}
