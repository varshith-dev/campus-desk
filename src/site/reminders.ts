// Reminders live in this browser only. Saving one is the one write action the agents can propose.
export interface Reminder {
  id: string;
  title: string;
  date: string;
  time?: string;
  note?: string;
}

const KEY = 'campus-desk:reminders:v1';

export class ReminderStore {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {}

  list(): Reminder[] {
    try {
      const raw = this.storage.getItem(KEY);
      const arr = raw ? (JSON.parse(raw) as Reminder[]) : [];
      return Array.isArray(arr) ? arr.sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`)) : [];
    } catch {
      return [];
    }
  }

  add(r: Omit<Reminder, 'id'>): Reminder {
    const all = this.list();
    const dup = all.find((x) => x.title === r.title && x.date === r.date && (x.time ?? '') === (r.time ?? ''));
    if (dup) return dup;
    const item: Reminder = { ...r, id: `r-${Date.now().toString(36)}-${all.length}` };
    this.storage.setItem(KEY, JSON.stringify([...all, item]));
    return item;
  }

  remove(id: string): void {
    this.storage.setItem(KEY, JSON.stringify(this.list().filter((r) => r.id !== id)));
  }
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** A calendar file that any calendar app can import. */
export function toIcs(reminders: Reminder[], stamp = '20261116T000000Z'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Desk//Sample//EN', 'CALSCALE:GREGORIAN'];
  for (const r of reminders) {
    const d = r.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${r.id}@campus-desk.invalid`, `DTSTAMP:${stamp}`);
    if (r.time) {
      const t = r.time.replace(':', '') + '00';
      lines.push(`DTSTART:${d}T${t}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d}`);
    }
    lines.push(`SUMMARY:${esc(r.title)}`);
    if (r.note) lines.push(`DESCRIPTION:${esc(r.note)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
