import type { Metadata } from 'next';
import { PageHeader } from '@/components/desk/bits';
import { AuthForms } from '@/components/desk/auth-forms';
import { pageContext } from '@/lib/page-data';
import { DEMO_ACCOUNT } from '@/lib/store';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  const { data } = await pageContext();
  const demo = process.env.SEED_DEMO_ACCOUNT === '0' ? null : { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password };
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader eyebrow="Optional" title="Sign in to keep your desk.">
        You can use everything as a guest. An account keeps your class settings, reminders and receipt tape on any device.
      </PageHeader>
      <AuthForms options={{ years: data.department.years, sections: data.department.sections, feeCategories: data.department.fee_categories }} demo={demo} />
    </div>
  );
}
