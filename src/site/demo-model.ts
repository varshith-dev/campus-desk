// The no-key default router: a small, rule-based stand-in for a language model that runs in the browser.
// It speaks the same interface as a real model (messages in, text or tool calls out), so the real agent loop,
// real site actions, real consent and real peer loading all run. It is not an AI model. It understands the
// question shapes listed in DEMO_CAPABILITIES and says so when it cannot answer.
import type { ChatRequest, ChatResult, LlmClient, ModelToolCall } from '@aw/runtime';

export const DEMO_CAPABILITIES = [
  'classes on a day, or the next class',
  'notices by topic',
  'fee due dates, amounts and late fees',
  'exam dates, times and venues',
  'saving a reminder with a date',
  'library hours, through the peer site',
];

export interface DemoOptions {
  today: string;
  office: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FULL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const SHORT_DAYS: Record<string, string> = { mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', thu: 'thursday', thur: 'thursday', thurs: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };

const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'what', 'when', 'about', 'there', 'with', 'has', 'have', 'from', 'that', 'this', 'does', 'much', 'many', 'which', 'can', 'you', 'please', 'tell', 'show', 'any', 'new', 'latest', 'its', 'how', 'who', 'where', 'why', 'will', 'our', 'your', 'out', 'get', 'give']);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

export function extractDays(text: string): string[] {
  const t = text.toLowerCase();
  const found: Array<{ i: number; v: string }> = [];
  const push = (re: RegExp, map: (m: RegExpExecArray) => string) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) found.push({ i: m.index, v: map(m) });
  };
  push(/\b(today|tomorrow)\b/g, (m) => m[1]!);
  push(new RegExp(`\\b(${FULL_DAYS.join('|')})\\b`, 'g'), (m) => m[1]!);
  push(new RegExp(`\\b(${Object.keys(SHORT_DAYS).join('|')})\\b`, 'g'), (m) => SHORT_DAYS[m[1]!]!);
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.i - b.i)
    .map((f) => f.v)
    .filter((v) => (seen.has(v) ? false : (seen.add(v), true)));
}

export function extractDate(text: string, today: string): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return iso[0];
  const m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join('|')})[a-z]*\\b(?:,?\\s+(\\d{4}))?`, 'i').exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
    const year = m[3] ?? today.slice(0, 4);
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  }
  const m2 = new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'i').exec(text);
  if (m2) {
    const month = MONTHS.indexOf(m2[1]!.toLowerCase()) + 1;
    const year = m2[3] ?? today.slice(0, 4);
    return `${year}-${String(month).padStart(2, '0')}-${String(Number(m2[2])).padStart(2, '0')}`;
  }
  return null;
}

function extractYearSection(text: string): { year?: number; section?: string } {
  const out: { year?: number; section?: string } = {};
  const y = /\byear\s*([23])\b/i.exec(text);
  if (y) out.year = Number(y[1]);
  const s = /\bsection\s*([ab])\b/i.exec(text);
  if (s) out.section = s[1]!.toUpperCase();
  return out;
}

const DELEGATION_KEYWORDS: Record<string, string[]> = {
  timetable_agent: ['class', 'timetable', 'schedule', 'lecture', 'room', 'today', 'tomorrow', 'next', 'cancel', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'mon', 'tue', 'wed', 'thu', 'fri', 'lab', 'moved'],
  notices_agent: ['notice', 'circular', 'announcement', 'announce', 'event', 'talk', 'workshop', 'placement', 'club', 'attendance', 'condonation', 'hack', 'news'],
  fees_exams_agent: ['fee', 'tuition', 'due', 'installment', 'exam', 'hall', 'ticket', 'practical', 'scholarship', 'revaluation', 'paper', 'test'],
  library: ['library', 'book', 'borrow', 'fine', 'overdue', 'reading', 'study'],
};

const STRONG: Record<string, string[]> = {
  timetable_agent: ['class', 'timetable', 'lecture', 'schedule'],
  notices_agent: ['notice', 'circular', 'announcement'],
  fees_exams_agent: ['fee', 'tuition', 'exam', 'hall'],
  library: ['library', 'book', 'borrow'],
};

function keywordScore(name: string, description: string, text: string): number {
  const words = new Set(tokens(text));
  const key = name.startsWith('peer_') ? 'library' : name;
  const table = DELEGATION_KEYWORDS[key];
  let score = 0;
  if (table) for (const k of table) if (words.has(k) || [...words].some((w) => w.startsWith(k) && k.length > 3)) score += 2;
  for (const k of STRONG[key] ?? []) if (words.has(k)) score += key === 'library' ? 6 : 3;
  for (const w of tokens(description)) if (words.has(w)) score += 0.5;
  return score;
}

function latestUserText(req: ChatRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i]!;
    if (m.role === 'user') return m.content ?? '';
  }
  return '';
}

/** The tool results the agent has received since the latest user message. */
function pendingResults(req: ChatRequest): Array<{ tool: string; content: string }> {
  let lastUser = -1;
  req.messages.forEach((m, i) => {
    if (m.role === 'user') lastUser = i;
  });
  return req.messages.slice(lastUser + 1).filter((m) => m.role === 'tool').map((m) => ({ tool: m.name ?? '', content: m.content ?? '' }));
}

let callSeq = 0;
const call = (name: string, args: unknown): ModelToolCall => ({ id: `demo_${++callSeq}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });

function parseResult(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const rangeDays = (n: number) => (n === 1 ? '1 day left' : n === 0 ? 'due today' : n < 0 ? `${-n} days past the due date` : `${n} days left`);

/** The scope strings are written for a language model. Say them to the student in the second person. */
function you(scope: string | undefined): string {
  return (scope ?? '')
    .replace('the student\u2019s saved class', 'your class')
    .replace('notices for the student\u2019s year', 'your year')
    .replace('the student\u2019s year and fee category', 'your year and fee category')
    .replace('the student\u2019s year', 'your year');
}

function formatResult(tool: string, content: string, today: string): string {
  if (content.startsWith('Error from tool:')) return `I could not do that. ${content.replace('Error from tool: ', '')}`;
  const r = parseResult(content);
  if (!r) return content; // text from another agent or a peer site
  if (r.status === 'cancelled') return 'Okay. I did not save anything.';
  if (r.status === 'unknown') return 'I am not sure that went through. Please check the Reminders list on the page before trying again.';
  if (r.status === 'failed') return `That did not work: ${r.note}`;
  const res = r.result ?? r;
  if (res.ok === false) return res.reason ?? 'That did not work.';
  switch (tool) {
    case 'website_get_timetable': {
      const day = res.date === today ? `today (${res.label})` : res.label;
      if (!res.classes?.length) return `No classes are listed for ${day}.`;
      const rows = res.classes.map((c: any) => {
        const base = `- ${c.start} to ${c.end}  ${c.course} ${c.name}, room ${c.room}`;
        if (c.status === 'cancelled') return `${base}. CANCELLED: ${c.change}`;
        if (c.status === 'moved') return `${base}. Changed: ${c.change}`;
        return base;
      });
      return `Classes for ${day}, ${you(res.scope)}:\n${rows.join('\n')}`;
    }
    case 'website_get_next_class': {
      if (!res.next) return 'I found no upcoming class in the next week.';
      const n = res.next;
      const when = n.date === today ? 'today' : n.label;
      return `Your next class is ${n.course} ${n.name} at ${n.start} ${when}, room ${n.room}${n.status === 'moved' ? ` (changed: ${n.change})` : ''}.`;
    }
    case 'website_search_notices': {
      if (!res.count) return 'I found no notice that matches. Try fewer words, or open the Notices page.';
      const rows = res.notices.map((n: any) => `- ${n.id}, ${n.label}: ${n.title}.${n.deadline ? ` Date to remember: ${n.deadline}.` : ''}`);
      return `${res.count} notice${res.count === 1 ? '' : 's'} for ${you(res.scope)}:\n${rows.join('\n')}\nThe full text is on the Notices page.`;
    }
    case 'website_get_fee_dates': {
      if (!res.fees?.length) return 'I found no fee that matches.';
      const rows = res.fees.map((f: any) => `- ${f.name}: ${res.currency} ${Number(f.amount).toLocaleString('en-IN')}, due ${f.dueLabel} (${rangeDays(f.daysLeft)}). Late fee ${res.currency} ${f.lateFeePerDay} per day, up to ${res.currency} ${Number(f.lateFeeCap).toLocaleString('en-IN')}.${f.note ? ` ${f.note}` : ''}`);
      return `Fees for ${you(res.scope)}:\n${rows.join('\n')}`;
    }
    case 'website_get_exam_dates': {
      if (!res.exams?.length) return `${res.note ?? 'No exam matches that.'} Try the course code, or look at the full list on the Fees and exams page.`;
      const rows = res.exams.map((e: any) => `- ${e.course} ${e.name}, ${e.type}: ${e.label}, ${e.start} to ${e.end}, ${e.venue} (${rangeDays(e.daysLeft)})`);
      return `Exams for ${you(res.scope)}:\n${rows.join('\n')}\nHall tickets are given out from ${res.hall_ticket_label}. ${res.rules}`;
    }
    case 'website_save_reminder':
      return `Saved: "${res.saved.title}" on ${res.saved.date}${res.saved.time ? ` at ${res.saved.time}` : ''}. It stays in this browser only. You can download it from the Reminders list.`;
    default:
      return typeof content === 'string' ? content : '';
  }
}

function factLines(system: string): string[] {
  return system
    .split('\n')
    .filter((l) => l.startsWith('FACT: '))
    .map((l) => l.slice(6));
}

function retrieve(system: string, text: string): string {
  const facts = factLines(system);
  if (!facts.length) return 'I do not have any published facts to answer from.';
  const q = new Set(tokens(text));
  const scored = facts.map((f) => ({ f, s: tokens(f).filter((t) => q.has(t)).length })).sort((a, b) => b.s - a.s);
  const top = scored[0]!;
  if (top.s === 0) return 'I do not know that from the published facts.';
  const keep = scored.filter((x) => x.s >= Math.max(1, top.s - (top.s > 2 ? 1 : 0))).slice(0, 3);
  const asOf = /as of ([^)]*)\)/.exec(system)?.[1];
  return `${asOf ? `From the published snapshot (sample data, as of ${asOf})` : 'From the published facts'}:\n${keep.map((k) => `- ${k.f}`).join('\n')}`;
}

export class DemoModel implements LlmClient {
  readonly label = 'In-browser demo model (rule-based, no key)';
  readonly router = 'browser://demo';
  readonly kind = 'demo' as const;

  constructor(private readonly opts: DemoOptions) {}

  async chat(req: ChatRequest): Promise<ChatResult> {
    const text = latestUserText(req);
    const results = pendingResults(req);
    const system = req.messages[0]?.content ?? '';
    const result = results.length ? this.compose(req, results) : this.decide(req, text, system);
    if (result.content && req.onText) {
      for (const chunk of result.content.match(/.{1,24}/gs) ?? []) req.onText(chunk);
    }
    return result;
  }

  private compose(req: ChatRequest, results: Array<{ tool: string; content: string }>): ChatResult {
    const parts = results.map((r) => {
      const t = formatResult(r.tool, r.content, this.opts.today);
      return r.tool.startsWith('peer_') ? `The library desk, a separate site, says:\n${t}` : t;
    });
    return { content: parts.join('\n\n'), tool_calls: [] };
  }

  private decide(req: ChatRequest, text: string, system: string): ChatResult {
    const tools = req.tools.map((t) => t.function.name);
    const actions = tools.filter((t) => t.startsWith('website_'));
    const delegates = req.tools.filter((t) => !t.function.name.startsWith('website_'));
    const lower = text.toLowerCase();

    if (/\b(pay|paying)\b.*\b(for me|on my behalf)\b|\bregister\b.*\bexam|\b(change|edit|move|cancel)\b.*\b(my )?timetable\b/.test(lower)) {
      return { content: `I cannot do that from this site. It only reads dates and notices, and saves reminders in your browser. Please ask the department office: ${this.opts.office}`, tool_calls: [] };
    }

    // Retrieval mode: no tools at all, so answer from published facts. This is how another site's visitor is served.
    if (!tools.length) return { content: retrieve(system, text), tool_calls: [] };

    // Action mode: this agent owns site actions.
    if (actions.length && !delegates.some((d) => d.function.name !== 'website_save_reminder')) {
      return this.pickActions(actions, text);
    }

    // A single delegate, such as a front desk with one specialist: always use it.
    if (delegates.length === 1 && !actions.length) return { content: '', tool_calls: [call(delegates[0]!.function.name, { request: text })] };

    // Front mode: reminders first, then route to the best delegates.
    const calls: ModelToolCall[] = [];
    if (/\bremind/.test(lower) && tools.includes('website_save_reminder')) {
      const date = extractDate(text, this.opts.today);
      if (!date) {
        return { content: 'Which date should I set the reminder for? For example: "Remind me to pay the tuition fee on 27 Nov".', tool_calls: [] };
      }
      const title = reminderTitle(text);
      const time = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text)?.[0];
      calls.push(call('website_save_reminder', { title, date, ...(time ? { time: time.padStart(5, '0') } : {}) }));
    }
    // Route each clause of the question to its best delegate, so "library hours" does not also trigger fees.
    const clauses = text
      .split(/(?<=[?.!])\s+|,\s*(?:and\s+)?|\s+and\s+(?=what|when|is|are|how|which|where|do|can)/i)
      .map((c) => c.trim())
      .filter(Boolean)
      .filter((c) => !/\bremind/i.test(c));
    const grouped = new Map<string, string[]>();
    for (const clause of clauses) {
      const best = delegates
        .map((d) => ({ name: d.function.name, s: keywordScore(d.function.name, d.function.description, clause) }))
        .filter((x) => x.s >= 2)
        .sort((a, b) => b.s - a.s)[0];
      if (best) grouped.set(best.name, [...(grouped.get(best.name) ?? []), clause]);
    }
    const delegated = [...grouped.entries()].map(([name, cs]) => call(name, { request: cs.join(' ') }));
    calls.unshift(...delegated);
    if (calls.length) return { content: '', tool_calls: calls };
    return {
      content: `In demo mode I can help with: ${DEMO_CAPABILITIES.join('; ')}. Try one of the example questions, or add your own model key in AI settings for open-ended questions.`,
      tool_calls: [],
    };
  }

  private pickActions(actions: string[], text: string): ChatResult {
    const lower = text.toLowerCase();
    const calls: ModelToolCall[] = [];
    const has = (n: string) => actions.includes(n);
    const ys = extractYearSection(text);

    if (has('website_get_next_class') && (/\bnext (class|lecture|period)\b|\bwhat('?s| is) next\b/.test(lower))) {
      calls.push(call('website_get_next_class', {}));
    }
    if (has('website_get_timetable') && (calls.length === 0 || extractDays(text).length)) {
      const days = extractDays(text);
      const date = extractDate(text, this.opts.today);
      const list = date ? [date] : days.length ? days : ['today'];
      for (const d of list.slice(0, 3)) calls.push(call('website_get_timetable', { day: d, ...ys }));
    }
    if (has('website_search_notices')) {
      const category = /\bexam/.test(lower) ? 'exams' : /\bfee/.test(lower) ? 'fees' : /\bplacement|resume|job/.test(lower) ? 'placement' : /\bevent|talk|workshop|hack|club/.test(lower) ? 'events' : /\battendance|project|lab\b/.test(lower) ? 'academic' : /\boffice|hall ticket/.test(lower) ? 'admin' : undefined;
      const query = tokens(text).filter((t) => !['notice', 'announcement', 'circular', 'news', 'recent'].includes(t)).join(' ');
      calls.push(call('website_search_notices', { query: category ? '' : query, ...(category ? { category } : {}) }));
    }
    if (has('website_get_fee_dates') || has('website_get_exam_dates')) {
      const wantsExam = /\b(exam|hall ticket|practical|revaluation)\b/.test(lower) && !/\bexam fee\b/.test(lower);
      const wantsFee = /\b(fee|tuition|installment|late|pay|due)\b/.test(lower);
      if (wantsFee && has('website_get_fee_dates')) {
        const item = /\bexam fee\b/.test(lower) ? 'exam' : /\btuition|installment\b/.test(lower) ? 'tuition' : /\blab\b/.test(lower) ? 'lab' : undefined;
        calls.push(call('website_get_fee_dates', item ? { item } : {}));
      }
      if (wantsExam && has('website_get_exam_dates')) {
        const code = /\b(cs\d{3}l?|ma\d{3}|hs\d{3})\b/i.exec(text)?.[0]?.toUpperCase();
        const named = /(?:when is|date of|dates? for|for)\s+(?:the\s+|my\s+)?([a-z ]+?)\s+(?:exam|test|practical)/i.exec(text)?.[1]?.trim();
        const type = /\bpractical|lab\b/.test(lower) ? 'Lab' : /\bend[- ]sem/.test(lower) ? 'End' : undefined;
        const course = code ?? (named && !/^(the|my|an?|next|final)$/i.test(named) ? named : undefined);
        calls.push(call('website_get_exam_dates', { ...(course ? { course } : {}), ...(type ? { type } : {}) }));
      }
      if (!calls.length) calls.push(call(has('website_get_fee_dates') ? 'website_get_fee_dates' : 'website_get_exam_dates', {}));
    }
    if (!calls.length) return { content: `In demo mode I can help with: ${DEMO_CAPABILITIES.join('; ')}.`, tool_calls: [] };
    return { content: '', tool_calls: calls };
  }
}

function reminderTitle(text: string): string {
  const m = /remind(?:er)?(?: me)?(?: to| about| of)?\s+(.+?)(?:\s+(?:on|by|before|at)\s+\d|\s+on\s+\w+day|$)/i.exec(text);
  let title = (m?.[1] ?? 'Reminder').replace(/[.?!]+$/, '').trim();
  if (!title || title.length < 3) title = 'Reminder';
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return title.slice(0, 80);
}
