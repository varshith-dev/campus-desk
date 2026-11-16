// A calendar file that any calendar app can import.
export interface IcsReminder {
  id: string;
  title: string;
  date: string;
  time?: string;
  note?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function toIcs(reminders: IcsReminder[], stamp = '20261116T000000Z'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Desk//Sample//EN', 'CALSCALE:GREGORIAN'];
  for (const r of reminders) {
    const d = r.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${r.id}@campus-desk.invalid`, `DTSTAMP:${stamp}`);
    lines.push(r.time ? `DTSTART:${d}T${r.time.replace(':', '')}00` : `DTSTART;VALUE=DATE:${d}`);
    lines.push(`SUMMARY:${esc(r.title)}`);
    if (r.note) lines.push(`DESCRIPTION:${esc(r.note)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
