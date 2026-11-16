// The tool catalog: names, purposes, schemas, scopes and which private fields each tool reads.
// Pure data with no server imports, so the browser, the server, the manifest builder and the tests share it.
import type { JsonSchema } from '../runtime/types';
import type { Department } from '../data/model';

export const SCOPES = {
  'timetable:read': 'Read your class timetable, including cancelled and moved classes',
  'notices:read': 'Read department notices for your year',
  'fees:read': 'Read fee due dates and the amounts for your fee category',
  'exams:read': 'Read exam dates, times and venues for your year',
  'reminders:propose': 'Propose a reminder. Nothing is saved until you confirm it',
} as const;
export type Scope = keyof typeof SCOPES;
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

export interface ToolSpec {
  name: string;
  purpose: string;
  effect: 'read' | 'write';
  scope: Scope;
  /** Names of the private fields this tool reads from the student's record. */
  reads: Array<'student_year' | 'student_section' | 'fee_category'>;
  schema: JsonSchema;
}

export function toolCatalog(dept: Pick<Department, 'years' | 'sections'>): ToolSpec[] {
  return [
    {
      name: 'get_timetable',
      purpose: "Read the class timetable for one day, including cancelled or moved classes. Uses the student's saved class unless a year and section are given.",
      effect: 'read',
      scope: 'timetable:read',
      reads: ['student_year', 'student_section'],
      schema: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'today, tomorrow, a weekday name such as Friday, or a date like 2026-11-18. Default is today.' },
          year: { type: 'integer', enum: dept.years, description: 'Only when asking about another year.' },
          section: { type: 'string', enum: dept.sections, description: 'Only when asking about another section.' },
        },
      },
    },
    { name: 'get_next_class', purpose: "Find the student's next class after the site clock, skipping cancelled ones.", effect: 'read', scope: 'timetable:read', reads: ['student_year', 'student_section'], schema: { type: 'object', properties: {} } },
    {
      name: 'search_notices',
      purpose: "Search the department notices, newest first, for the student's year.",
      effect: 'read',
      scope: 'notices:read',
      reads: ['student_year'],
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', maxLength: 120, description: 'Words to look for. Leave empty for the latest notices.' },
          category: { type: 'string', enum: ['exams', 'fees', 'academic', 'events', 'placement', 'admin'] },
          limit: { type: 'integer', minimum: 1, maximum: 10 },
        },
      },
    },
    {
      name: 'get_fee_dates',
      purpose: "Read fee due dates, amounts for the student's fee category, and late fees.",
      effect: 'read',
      scope: 'fees:read',
      reads: ['student_year', 'fee_category'],
      schema: { type: 'object', properties: { item: { type: 'string', maxLength: 60, description: 'Part of a fee name, such as exam or tuition.' } } },
    },
    {
      name: 'get_exam_dates',
      purpose: "Read exam dates, times and venues for the student's year.",
      effect: 'read',
      scope: 'exams:read',
      reads: ['student_year'],
      schema: {
        type: 'object',
        properties: {
          course: { type: 'string', maxLength: 60, description: 'A course code such as CS201 or part of a course name.' },
          type: { type: 'string', maxLength: 30, description: 'Lab practical or End-semester.' },
        },
      },
    },
    {
      name: 'save_reminder',
      purpose: 'Save a reminder for the student. The student must confirm it first.',
      effect: 'write',
      scope: 'reminders:propose',
      reads: [],
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 80 },
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'A date such as 2026-11-30.' },
          time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', description: '24 hour time such as 09:00.' },
          note: { type: 'string', maxLength: 200 },
        },
        required: ['title', 'date'],
      },
    },
  ];
}

