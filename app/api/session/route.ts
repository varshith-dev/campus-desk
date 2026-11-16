import { ensureStudent, json } from '@/lib/http';
import { loadCampusData } from '@/lib/store';
import { siteClock, toolCatalog } from '@/lib/tools';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { db, student } = await ensureStudent();
  const data = await loadCampusData(db);
  const clock = siteClock(data, new URL(req.url).searchParams.get('now'));
  return json({
    ok: true,
    student: { kind: student.kind, name: student.name, email: student.email, profile: student.profile, pairingCode: student.pairingCode },
    clock,
    department: { short: data.department.short, years: data.department.years, sections: data.department.sections, feeCategories: data.department.fee_categories },
    tools: toolCatalog(data.department),
  });
}
