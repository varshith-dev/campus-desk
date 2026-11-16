import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CampusData } from '../src/data/model';

const root = join(import.meta.dirname, '..');
const read = (f: string) => JSON.parse(readFileSync(join(root, 'data/seed', f), 'utf8'));

export function loadSample(): CampusData {
  return { department: read('department.json'), timetable: read('timetable.json'), notices: read('notices.json').notices, fees: read('fees.json'), exams: read('exams.json') };
}
