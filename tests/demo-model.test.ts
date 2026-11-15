import { describe, expect, it } from 'vitest';
import { AgentRuntime, Trace } from '@aw/runtime';
import type { Manifest, NetworkDef } from '@aw/runtime';
import { createActions, slyFromProfile } from '../src/site/actions';
import { DemoModel, extractDate, extractDays, tokens } from '../src/site/demo-model';
import { ReminderStore } from '../src/site/reminders';
import { DEFAULT_PROFILE } from '../src/data/model';
import type { Profile } from '../src/data/model';
import { fakeFetch, loadSample, readJson, twoAgent } from './helpers';

const data = loadSample();
const manifest = readJson('public/agent-manifest.json') as Manifest;
const network = readJson('public/campus_desk.network.json') as NetworkDef;
const libManifest = readJson('peer/library-desk/agent-manifest.json') as Manifest;
const libNetwork = readJson('peer/library-desk/library_desk.network.json') as NetworkDef;
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

async function ask(q: string, opts: { profile?: Profile; confirm?: boolean; now?: string } = {}) {
  const trace = new Trace();
  const store = new ReminderStore(mem());
  const now = opts.now ?? data.department.sample_now;
  const rt = new AgentRuntime({
    manifest,
    siteOrigin: 'http://localhost:5173',
    network,
    networkName: 'campus_desk',
    frontMan: 'campus_desk',
    llm: new DemoModel({ today: now.slice(0, 10), office: 'Block C, Room 104' }),
    actions: createActions({ data, today: now.slice(0, 10), now, reminders: store }),
    actionBindings: manifest.actions!.bindings,
    sly: slyFromProfile(opts.profile ?? DEFAULT_PROFILE),
    consent: async () => 'allow',
    confirm: async () => opts.confirm ?? true,
    fetchImpl: fakeFetch({ 'http://localhost:5174/agent-manifest.json': libManifest, 'http://localhost:5174/library_desk.network.json': libNetwork }).impl,
    trace,
  });
  const res = await rt.run(q);
  return { text: res.text, trace, store, tools: trace.events.filter((e) => e.type === 'tool_call').map((e: any) => e.tool as string) };
}

describe('demo model: parsing helpers', () => {
  it('finds days in order, once each', () => expect(extractDays('Is Friday free? and today, also friday')).toEqual(['friday', 'today']));
  it('does not treat "month" as Monday', () => expect(extractDays('this month')).toEqual([]));
  it('reads dates written in common ways', () => {
    expect(extractDate('on 27 Nov', '2026-11-16')).toBe('2026-11-27');
    expect(extractDate('by Dec 3rd', '2026-11-16')).toBe('2026-12-03');
    expect(extractDate('2026-12-01', '2026-11-16')).toBe('2026-12-01');
    expect(extractDate('soon', '2026-11-16')).toBeNull();
  });
  it('drops filler words and plurals', () => expect(tokens('What are the exams?')).toEqual(['exam']));
});

describe('demo model through the real runtime', () => {
  it('answers the timetable for today with the classes in order', async () => {
    const r = await ask('What classes do I have today?');
    expect(r.tools).toEqual(['timetable_agent', 'website_get_timetable']);
    expect(r.text).toMatch(/Classes for today \(Mon 16 Nov 2026\), your class/);
    expect(r.text.indexOf('CS201 ')).toBeLessThan(r.text.indexOf('CS203'));
  });
  it('says a class is cancelled and why', async () => {
    const r = await ask('Is my Wednesday class on?');
    expect(r.text).toMatch(/CS203 Discrete Mathematics.*CANCELLED: The faculty member is on leave/);
  });
  it('uses the saved class, so another section gets different rooms', async () => {
    const a = await ask('classes on Monday?', { profile: { year: 3, section: 'B', feeCategory: 'general' } });
    expect(a.text).toMatch(/CS302 Database Systems, room C-302/);
  });
  it('answers an explicit year and section in the question', async () => {
    const r = await ask('What classes does year 3 section A have on Friday?');
    expect(r.text).toMatch(/Year 3 section A/);
    expect(r.text).toMatch(/CS302L Database Lab, room Lab 4/);
  });
  it('gives the fee amount for the saved fee category', async () => {
    const g = await ask('When is the tuition fee due, and what is the late fee?');
    expect(g.text).toMatch(/Rs 42,500, due Mon 30 Nov 2026 \(14 days left\)\. Late fee Rs 100 per day, up to Rs 1,000/);
    const s = await ask('When is the tuition fee due?', { profile: { year: 2, section: 'A', feeCategory: 'scholarship' } });
    expect(s.text).toMatch(/Rs 0, due/);
  });
  it('answers an exam question for the saved year only', async () => {
    const r = await ask('When is the Data Structures exam?');
    expect(r.tools).toEqual(['fees_exams_agent', 'website_get_exam_dates']);
    expect(r.text).toMatch(/CS201 Data Structures, End-semester: Mon 14 Dec 2026, 10:00 to 13:00, Exam Hall A \(28 days left\)/);
  });
  it('says plainly when an exam is not for the saved year', async () => {
    const r = await ask('When is the Operating Systems exam?');
    expect(r.text).toMatch(/No exam matches that/);
  });
  it('finds notices by topic', async () => {
    const r = await ask('Any new notices about exams?');
    expect(r.text).toMatch(/n-01.*End-semester exam timetable published/);
  });
  it('splits a two-part question between two specialists', async () => {
    const r = await ask('What is my next class, and when is the tuition fee due?');
    expect(r.tools).toEqual(expect.arrayContaining(['timetable_agent', 'fees_exams_agent']));
    expect(r.text).toMatch(/Your next class is/);
    expect(r.text).toMatch(/Tuition, installment 2/);
  });
  it('sends library questions only to the library peer, after consent', async () => {
    const r = await ask('Is the library open late during exams?');
    expect(r.tools).toEqual(['peer_localhost_5174_library_desk', 'library_facts']);
    expect(r.tools).not.toContain('fees_exams_agent');
    expect(r.text).toMatch(/open until 22:00/);
  });
  it('saves a reminder only after the visitor confirms', async () => {
    const yes = await ask('Remind me to pay the tuition fee on 27 Nov');
    expect(yes.store.list()).toEqual([expect.objectContaining({ title: 'Pay the tuition fee', date: '2026-11-27' })]);
    expect(yes.text).toMatch(/Saved: "Pay the tuition fee" on 2026-11-27/);
    const no = await ask('Remind me to pay the tuition fee on 27 Nov', { confirm: false });
    expect(no.store.list()).toEqual([]);
    expect(no.text).toMatch(/I did not save anything/);
  });
  it('asks for the date when a reminder has none', async () => {
    const r = await ask('Remind me to pay the exam fee');
    expect(r.text).toMatch(/Which date/);
    expect(r.tools).toEqual([]);
  });
  it('declines what the site cannot do and points to the office', async () => {
    const r = await ask('Can you pay my fees for me?');
    expect(r.text).toMatch(/cannot do that from this site.*Block C, Room 104/);
    expect(r.tools).toEqual([]);
  });
  it('says what demo mode can do when it does not understand', async () => {
    const r = await ask('What is the meaning of life?');
    expect(r.text).toMatch(/In demo mode I can help with/);
  });
  it('never puts the saved class in anything the model is shown', async () => {
    const trace = new Trace();
    const seen: string[] = [];
    const demo = new DemoModel({ today: '2026-11-16', office: 'x' });
    const spy = { label: demo.label, router: demo.router, kind: demo.kind, chat: async (req: Parameters<DemoModel['chat']>[0]) => (seen.push(JSON.stringify(req.messages.filter((m) => m.role !== 'tool'))), demo.chat(req)) };
    const rt = new AgentRuntime({ manifest, siteOrigin: 'http://localhost:5173', network, networkName: 'campus_desk', frontMan: 'campus_desk', llm: spy as never, actions: createActions({ data, today: '2026-11-16', now: data.department.sample_now, reminders: new ReminderStore(mem()) }), actionBindings: manifest.actions!.bindings, sly: { student_year: 3, student_section: 'B', fee_category: 'sponsored' }, consent: async () => 'allow', confirm: async () => true, trace });
    await rt.run('What classes do I have today?');
    const all = seen.join('\n');
    expect(all).not.toMatch(/sponsored|student_section|"B"/);
  });
});

describe('another site calls Campus Desk and gets the published snapshot', () => {
  it('runs the network in the caller browser with no site actions, and answers from the snapshot', async () => {
    const SITE = 'https://campus.example';
    const callerNet = twoAgent();
    callerNet.tools = [{ name: 'front', function: { description: 'asks campus', parameters: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'] } }, instructions: 'Ask the campus network.', tools: [`${SITE}/campus_desk`] }];
    const callerManifest: Manifest = { networks: [{ name: 'caller', front_man: 'front', hocon: './caller.network.json' }], allowed_peers: [SITE], peer_policy: { mode: 'closed' } };
    const publishedManifest = structuredClone(manifest);
    const publishedNetwork = structuredClone(network);
    const trace = new Trace();
    const rt = new AgentRuntime({
      manifest: callerManifest,
      siteOrigin: 'https://caller.example',
      network: callerNet,
      networkName: 'caller',
      frontMan: 'front',
      llm: new DemoModel({ today: '2026-11-16', office: 'x' }),
      consent: async () => 'allow',
      confirm: async () => false,
      fetchImpl: fakeFetch({ [`${SITE}/agent-manifest.json`]: publishedManifest, [`${SITE}/campus_desk.network.json`]: publishedNetwork }).impl,
      trace,
    });
    const res = await rt.run('When is the CS201 exam?');
    const tools = trace.events.filter((e) => e.type === 'tool_call').map((e: any) => e.tool);
    expect(tools).toEqual(['peer_campus_example_campus_desk', 'fees_exams_agent']);
    expect(tools.some((t: string) => t.startsWith('website_'))).toBe(false);
    expect(res.text).toMatch(/snapshot \(sample data, as of Mon 16 Nov 2026\)/);
    expect(res.text).toMatch(/CS201 Data Structures, End-semester, Mon 14 Dec 2026, 10:00-13:00, Exam Hall A/);
  });
});
