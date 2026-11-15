// A second, tiny agent site: the library of the same fictional institute. It exists so that Campus Desk has
// a real peer on another origin to hand off to, and so that Campus Desk can be called from it.
import type { Manifest, NetworkDef } from '../src/runtime/types';

export const LIB_NETWORK = 'library_desk';

export const LIBRARY_FACTS = [
  'FACT: Library hours, normal weeks: Monday to Saturday, 08:30 to 20:00. Closed on Sunday.',
  'FACT: Exam weeks, from Monday 7 December 2026 to Wednesday 23 December 2026: the reading hall is open until 22:00, Monday to Sunday.',
  'FACT: Borrowing: undergraduate students can borrow 4 books for 14 days and renew twice online.',
  'FACT: Overdue fine: Rs 2 per day for each book, up to the price of the book.',
  'FACT: Group study rooms: book at the front desk for up to 2 hours. Bring your student ID.',
  'FACT: Past exam papers are on the second floor, in the reference section. They are for reading only.',
  'FACT: Contact: library@eastbrook.example, front desk on the ground floor.',
];

export function buildLibraryNetwork(): NetworkDef {
  return {
    metadata: {
      description: 'Library hours, borrowing rules, fines and study rooms for the Eastbrook Institute of Technology library (fictional sample).',
      sample_queries: ['Is the library open late during exams?', 'How many books can I borrow?'],
    },
    llm_config: { model_name: 'gemini-2.5-flash' },
    max_steps: 4,
    tools: [
      {
        name: 'library_desk',
        function: {
          description: 'Front desk of the Eastbrook library: opening hours, exam-week hours, borrowing limits, fines and study rooms.',
          parameters: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'] },
        },
        instructions:
          'You are the assistant for the Eastbrook Institute of Technology library (sample data). Ask library_facts for anything about hours, borrowing, fines or rooms and answer from what it returns. Never ask for names, IDs or card numbers. If it does not know, say so and give the front desk email.',
        tools: ['library_facts'],
      },
      {
        name: 'library_facts',
        function: {
          description: 'Holds the published library facts. Returns the lines that match the question.',
          parameters: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'] },
        },
        instructions: ['Answer only from these published facts. If none match, say you do not know.', ...LIBRARY_FACTS].join('\n'),
        tools: [],
      },
    ],
  };
}

export function buildLibraryManifest(): Manifest {
  return {
    brand: 'Eastbrook Library Desk (sample peer site)',
    networks: [
      {
        name: LIB_NETWORK,
        front_man: 'library_desk',
        hocon: `./${LIB_NETWORK}.network.json`,
        description: 'Library hours, borrowing and fines for the fictional Eastbrook Institute of Technology.',
        tags: ['sample-data', 'peer-demo'],
        sample_queries: ['Is the library open late during exams?'],
      },
    ],
    llm_router: { base_url: 'browser://demo', mock: true },
    allowed_peers: [],
    peer_policy: { mode: 'closed', deny_origins: [], note: 'This demo peer calls no other site.' },
    deployment: { mode: 'static', self_contained_runtime: false, note: 'Publishes files only. Other sites run its network in their own browser.' },
  } as Manifest;
}
