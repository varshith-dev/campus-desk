import { DEFAULT_PROFILE } from '../data/model';
import type { CampusData, Profile } from '../data/model';

const KEY = 'campus-desk:profile:v1';

export class ProfileState {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {}

  load(): Profile {
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return DEFAULT_PROFILE;
      const p = JSON.parse(raw) as Partial<Profile>;
      return {
        year: Number.isInteger(p.year) ? (p.year as number) : DEFAULT_PROFILE.year,
        section: typeof p.section === 'string' ? p.section : DEFAULT_PROFILE.section,
        feeCategory: typeof p.feeCategory === 'string' ? p.feeCategory : DEFAULT_PROFILE.feeCategory,
      };
    } catch {
      return DEFAULT_PROFILE;
    }
  }

  save(p: Profile): void {
    this.storage.setItem(KEY, JSON.stringify(p));
  }
}

/** The site clock is fixed to the sample date so every visit gives the same answers. ?today= and ?now= override it. */
export function siteClock(data: CampusData, search: string): { today: string; now: string } {
  const q = new URLSearchParams(search);
  const nowParam = q.get('now');
  const todayParam = q.get('today');
  if (nowParam && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(nowParam)) return { today: nowParam.slice(0, 10), now: nowParam };
  if (todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam)) return { today: todayParam, now: `${todayParam}T08:00` };
  return { today: data.department.sample_today, now: data.department.sample_now };
}
