// Builds the published files for the Campus Desk agent site from the sample data.
// The result is data only: no code, no includes, no environment substitutions (spec section 2.2).
import type { AgentDef, Manifest, NetworkDef } from '../src/runtime/types';
import { WEEKDAYS, WEEKDAY_NAMES, formatDate, money, classesOn } from '../src/data/model';
import type { CampusData } from '../src/data/model';

export const NETWORK_NAME = 'campus_desk';
export const FRONT_MAN = 'campus_desk';
/** Which agent owns which site action. Published in the manifest, not in the network file. */
export const ACTION_BINDINGS: Record<string, string[]> = {
  campus_desk: ['website_save_reminder'],
  timetable_agent: ['website_get_timetable', 'website_get_next_class'],
  notices_agent: ['website_search_notices'],
  fees_exams_agent: ['website_get_fee_dates', 'website_get_exam_dates'],
};
export const ACTION_NAMES = ['get_timetable', 'get_next_class', 'search_notices', 'get_fee_dates', 'get_exam_dates', 'save_reminder'];

const REQUEST_PARAMS = {
  type: 'object',
  properties: { request: { type: 'string', description: 'The question in plain language, one or two sentences.' } },
  required: ['request'],
} as const;

export interface BuildOptions {
  /** Full URL of the library peer network, or undefined to publish no peer link. */
  peerUrl?: string;
}

const lines = (...ls: string[]) => ls.join('\n');

export function timetableFacts(data: CampusData): string[] {
  const out: string[] = [];
  for (const tt of data.timetable.timetables) {
    for (const day of WEEKDAYS) {
      const slots = tt.days[day];
      if (!slots) continue;
      const parts = slots.map((s) => {
        const c = data.timetable.courses.find((x) => x.code === s.course)!;
        return `${s.start}-${s.end} ${s.course} ${c.name} (${s.room})`;
      });
      out.push(`FACT: Timetable, Year ${tt.year} section ${tt.section}, ${WEEKDAY_NAMES[day]}: ${parts.join('; ')}.`);
    }
  }
  for (const ch of data.timetable.changes) {
    const c = data.timetable.courses.find((x) => x.code === ch.course)!;
    const who = ch.section === 'all' ? `Year ${ch.year}, all sections` : `Year ${ch.year} section ${ch.section}`;
    out.push(`FACT: Timetable change on ${formatDate(ch.date)} for ${who}: ${ch.course} ${c.name} is ${ch.kind === 'cancelled' ? 'cancelled' : ch.kind === 'room' ? 'in a different room' : 'at a different time'}. ${ch.detail}`);
  }
  return out;
}

export function noticeFacts(data: CampusData): string[] {
  return data.notices.map((n) => `FACT: Notice ${n.id}, ${formatDate(n.date)}, ${n.category}, for year ${n.years.join(' and ')}: ${n.title}. ${n.body}${n.deadline ? ` Date to remember: ${formatDate(n.deadline)}.` : ''}`);
}

export function feeFacts(data: CampusData): string[] {
  const out = data.fees.items.map((f) => {
    const amounts = Object.entries(f.amounts)
      .map(([k, v]) => `${k} ${money(data, v)}`)
      .join(', ');
    return `FACT: Fee "${f.name}", year ${f.years.join(' and ')}, due ${formatDate(f.due)}. Amounts: ${amounts}. Late fee ${money(data, f.late_fee_per_day)} per day, up to ${money(data, f.late_fee_cap)}. ${f.note}`;
  });
  return out;
}

export function examFacts(data: CampusData): string[] {
  const out = data.exams.exams.map((e) => {
    const c = data.timetable.courses.find((x) => x.code === e.course)!;
    return `FACT: Exam, year ${e.year}, ${e.course} ${c.name}, ${e.type}, ${formatDate(e.date)}, ${e.start}-${e.end}, ${e.venue}.`;
  });
  out.push(`FACT: Hall tickets are given out from ${formatDate(data.exams.hall_ticket_release)} at the department office. ${data.exams.rules}`);
  return out;
}

export function officeFact(data: CampusData): string {
  const o = data.department.office;
  return `FACT: Department office: ${o.place}, ${o.hours}, ${o.email}.`;
}

const snapshotHeader = (data: CampusData) =>
  `Published snapshot (sample data, as of ${formatDate(data.department.sample_today)}). Use it only when you have no website_* tools, for example when another site is running this network. Say that it is a snapshot and that the Campus Desk page has the latest.`;

export function buildCampusNetwork(data: CampusData, opts: BuildOptions = {}): NetworkDef {
  const dept = data.department;
  const label = `${dept.short}`;
  const grounding = lines(
    'Facts come only from website_* tool results, from the published snapshot below, and from this conversation.',
    'If a result does not contain a fact, say you do not know and point to the department office. Do not guess.',
    'Never invent dates, rooms, amounts, notice text or names.',
    'This site cannot pay fees, register for exams, or change a timetable. If asked, say so plainly and point to the department office.',
    'Dates and times in tool results are the sample site clock, not the real date.',
  );

  const timetable: AgentDef = {
    name: 'timetable_agent',
    function: {
      description: `Answers questions about class timetables at ${label}: classes on a day, the next class, room or time changes and cancellations.`,
      parameters: REQUEST_PARAMS as never,
    },
    instructions: lines(
      `You answer timetable questions for the ${dept.department}.`,
      grounding,
      'How to work:',
      '- For a day, call website_get_timetable. For "what is next", call website_get_next_class.',
      '- Say clearly when a class is cancelled or moved, and give the reason from the result.',
      '- Keep answers short: one line per class with the time, course and room.',
      '',
      snapshotHeader(data),
      ...timetableFacts(data),
      officeFact(data),
    ),
    tools: [],
  };

  const notices: AgentDef = {
    name: 'notices_agent',
    function: {
      description: `Finds and summarises department notices at ${label}: exams, fees, academic, events, placement and office notices.`,
      parameters: REQUEST_PARAMS as never,
    },
    instructions: lines(
      `You find and summarise notices for the ${dept.department}.`,
      grounding,
      'How to work:',
      '- Call website_search_notices with a few key words, or a category when the visitor names one.',
      '- Give the notice title, its date and the date to remember. Mention the notice id so the visitor can find it on the Notices page.',
      '- Do not paste a whole notice. Two sentences is enough.',
      '',
      snapshotHeader(data),
      ...noticeFacts(data),
      officeFact(data),
    ),
    tools: [],
  };

  const feesExams: AgentDef = {
    name: 'fees_exams_agent',
    function: {
      description: `Answers fee due dates, amounts, late fees and exam dates, times and venues at ${label}.`,
      parameters: REQUEST_PARAMS as never,
    },
    instructions: lines(
      `You answer fee and exam date questions for the ${dept.department}.`,
      grounding,
      'How to work:',
      '- For fees, call website_get_fee_dates. For exams, call website_get_exam_dates.',
      '- Give the due date, how many days are left, the amount and the late fee. The amount in the result already fits the visitor\u2019s fee category.',
      '- For exams, give date, time and venue. Mention hall tickets when asked.',
      '',
      snapshotHeader(data),
      ...feeFacts(data),
      ...examFacts(data),
      officeFact(data),
    ),
    tools: [],
  };

  const peerLines = opts.peerUrl
    ? [
        `- For library hours, borrowing rules or fines, hand off to the library network (tool for ${opts.peerUrl}). It is run by another site, so the visitor has to agree first. Send one short sentence and no personal details.`,
      ]
    : [];

  const front: AgentDef = {
    name: FRONT_MAN,
    function: {
      description: `Front desk for the ${dept.department} at ${dept.institute}. Handles timetable, notices, fee and exam dates, and reminders.${opts.peerUrl ? ' Can ask the library desk about library hours.' : ''}`,
      parameters: REQUEST_PARAMS as never,
    },
    instructions: lines(
      `You are the assistant on the ${dept.short} department website (${dept.institute}, sample data). You help students find their timetable, notices, fee dates and exam dates.`,
      grounding,
      'How to work:',
      '- Timetable, next class, room changes: ask timetable_agent.',
      '- Notices and circulars: ask notices_agent.',
      '- Fee due dates, late fees and exam dates: ask fees_exams_agent.',
      '- When a question needs two of these, ask both and combine the answers.',
      '- To save a reminder, call website_save_reminder. Ask for the date first if it is missing. The visitor confirms in a dialog.',
      ...peerLines,
      '- Delegate with the visitor\u2019s own words. Do not add a year, section or fee category: the site already knows them and keeps them private.',
      'When another site is running this network and you have no website_* tools, say what this site can help with (timetable, notices, fee and exam dates) and answer from your specialists\u2019 published snapshots. Do not ask for names, roll numbers or other personal details.',
      officeFact(data),
    ),
    tools: ['timetable_agent', 'notices_agent', 'fees_exams_agent', ...(opts.peerUrl ? [opts.peerUrl] : [])],
    // Private context: deny by default. Nothing is named, so no field may leave for another site.
    allow: { to_downstream: { sly_data: [] }, from_downstream: { sly_data: [] } },
  };

  const sampleQueries = [
    'What classes do I have today?',
    'What is my next class?',
    'Is my Wednesday class on?',
    'When is the tuition fee due, and what is the late fee?',
    'When is the Operating Systems exam?',
    'Any new notices about exams?',
    'Is the library open late during exams?',
    'Can you pay my fees for me?',
  ];

  return {
    metadata: {
      description: `Ask about timetables, notices, fee dates and exam dates at the ${dept.department}, ${dept.institute} (sample data).`,
      sample_queries: sampleQueries,
    },
    llm_config: { model_name: 'gemini-2.5-flash' },
    max_steps: 6,
    limits: { maxDepth: 4, maxAgentCalls: 16, maxRemoteCalls: 2, maxPerPeer: 1, maxMs: 60_000 },
    link_labels: opts.peerUrl ? { [opts.peerUrl]: 'Eastbrook Library Desk' } : {},
    tools: [front, timetable, notices, feesExams],
  };
}

export function buildManifest(data: CampusData, opts: BuildOptions = {}): Manifest {
  const peerOrigin = opts.peerUrl ? new URL(opts.peerUrl).origin : undefined;
  return {
    brand: `Campus Desk: ${data.department.short}`,
    networks: [
      {
        name: NETWORK_NAME,
        front_man: FRONT_MAN,
        hocon: `./${NETWORK_NAME}.network.json`,
        description: `Timetable, notices, fee dates and exam dates for the ${data.department.department} (fictional sample department).`,
        tags: ['agentified-website', 'education', 'sample-data'],
        sample_queries: (buildCampusNetwork(data, opts).metadata?.sample_queries as string[]) ?? [],
      },
    ],
    llm_router: {
      base_url: 'browser://demo',
      mock: true,
      byok_router: 'https://generativelanguage.googleapis.com/v1beta/openai',
    },
    allowed_peers: peerOrigin ? [peerOrigin] : [],
    peer_policy: {
      mode: 'closed',
      deny_origins: [],
      note: 'Calls only the sites in allowed_peers, and only after the visitor agrees on a card.',
    },
    agent_mcp: {
      protocol: 'nsdeploy-agent-mcp/v1',
      network: NETWORK_NAME,
      front_man: FRONT_MAN,
      available: false,
      reason: 'This is a static site. A public MCP endpoint needs a server. Other sites run the published network in their own browser instead.',
    },
    theme: { primary: '#1d4ed8' },
    linking: {
      protocol: 'nsdeploy-link/v1',
      exports: [{ network: NETWORK_NAME, front_man: FRONT_MAN, aliases: [NETWORK_NAME], url: NETWORK_NAME }],
      imports: [],
      link_updates: { mode: 'browser-local' },
    },
    deployment: {
      mode: 'static',
      self_contained_runtime: true,
      browser_mock: true,
      direct_byok: true,
      direct_mcp_requires_cors: true,
      public_mcp_facade: false,
    },
    private_context: {
      note: 'Year, section and fee category are private context (sly_data). They never leave for another site: the front agent names no fields.',
      fields: ['student_year', 'student_section', 'fee_category'],
      to_peers: [],
    },
    actions: {
      version: 1,
      scope: 'same-origin',
      agentTools: ACTION_NAMES.map((n) => `website_${n}`),
      bindings: ACTION_BINDINGS,
      note: 'Site actions run on this origin only and are bound to agents here, so the network file stays plain agent data. Another site that runs this network gets the published snapshot, not these actions.',
    },
    runtime: {
      file: './runtime/agentic-runtime.js',
      kind: 'browser-es-module',
      spec_profile: 'MVP Profile 0.2',
    },
  } as Manifest;
}

export function describeClassesForDocs(data: CampusData): string {
  return classesOn(data, data.department.sample_today, 2, 'A')
    .map((c) => `${c.start} ${c.course}`)
    .join(', ');
}
