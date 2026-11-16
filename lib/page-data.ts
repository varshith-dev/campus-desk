// What a server-rendered page needs: the department data from the database, the student (or the default class for a
// first-time visitor), and the site clock.
import { peekStudent } from './http';
import { loadCampusData, type Student } from './store';
import { siteClock } from './tools';
import { DEFAULT_PROFILE, type CampusData, type Profile } from '@/src/data/model';

export interface PageContext {
  data: CampusData;
  student: Student | null;
  profile: Profile;
  today: string;
  now: string;
}

export async function pageContext(searchParams?: Record<string, string | string[] | undefined>): Promise<PageContext> {
  const { db, student } = await peekStudent();
  const data = await loadCampusData(db);
  const raw = searchParams?.now;
  const { today, now } = siteClock(data, typeof raw === 'string' ? raw : null);
  return { data, student, profile: student?.profile ?? DEFAULT_PROFILE, today, now };
}
