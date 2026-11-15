import type { CampusData } from './model';

/** Load the five public data files. They are plain JSON on the same origin as the page. */
export async function loadCampusData(base: string, fetchImpl: typeof fetch = fetch): Promise<CampusData> {
  const get = async (name: string) => {
    const res = await fetchImpl(new URL(`data/${name}`, base).href);
    if (!res.ok) throw new Error(`Could not load data/${name} (HTTP ${res.status}).`);
    return res.json();
  };
  const [department, timetable, notices, fees, exams] = await Promise.all([get('department.json'), get('timetable.json'), get('notices.json'), get('fees.json'), get('exams.json')]);
  return { department, timetable, notices: notices.notices, fees, exams } as CampusData;
}
