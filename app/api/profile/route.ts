import { ensureStudent, json, problem, readJson } from '@/lib/http';
import { loadCampusData, updateProfile } from '@/lib/store';

export async function PUT(req: Request) {
  const { db, student } = await ensureStudent();
  const b = await readJson(req);
  const data = await loadCampusData(db);
  const year = Number(b.year);
  const section = String(b.section ?? '');
  const feeCategory = String(b.feeCategory ?? '');
  if (!data.department.years.includes(year) || !data.department.sections.includes(section) || !data.department.fee_categories.some((c) => c.id === feeCategory)) return problem(400, 'bad_profile', 'Pick a year, section and fee category from the lists.');
  await updateProfile(db, student.id, { year, section, feeCategory });
  return json({ ok: true, profile: { year, section, feeCategory } });
}
