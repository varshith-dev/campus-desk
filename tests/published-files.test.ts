import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTION_BINDINGS, ACTION_NAMES, buildCampusNetwork, buildManifest, examFacts, feeFacts, noticeFacts, timetableFacts } from '../network/campus-desk';
import { buildLibraryManifest, buildLibraryNetwork } from '../network/library-desk';
import { runChecks } from '../src/site/checks';
import { createActions } from '../src/site/actions';
import { ReminderStore } from '../src/site/reminders';
import { WEEKDAYS } from '../src/data/model';
import { loadSample, readJson, root } from './helpers';

const data = loadSample();
const PEER = 'http://localhost:5174/library_desk';
const manifest = readJson('public/agent-manifest.json');
const network = readJson('public/campus_desk.network.json');

describe('published files match the data and the builder', () => {
  it('public/ is not stale: the committed manifest and network equal a fresh build', () => {
    expect(manifest).toEqual(JSON.parse(JSON.stringify(buildManifest(data, { peerUrl: PEER }))));
    expect(network).toEqual(JSON.parse(JSON.stringify(buildCampusNetwork(data, { peerUrl: PEER }))));
    expect(readJson('peer/library-desk/agent-manifest.json')).toEqual(JSON.parse(JSON.stringify(buildLibraryManifest())));
    expect(readJson('peer/library-desk/library_desk.network.json')).toEqual(JSON.parse(JSON.stringify(buildLibraryNetwork())));
  });

  it('the manifest has what the spec requires: name, front_man, hocon, router, peer policy', () => {
    const entry = manifest.networks[0];
    expect(entry).toMatchObject({ name: 'campus_desk', front_man: 'campus_desk', hocon: './campus_desk.network.json' });
    expect(manifest.llm_router).toMatchObject({ mock: true, byok_router: 'https://generativelanguage.googleapis.com/v1beta/openai' });
    expect(manifest.peer_policy.mode).toBe('closed');
    expect(manifest.allowed_peers).toEqual(['http://localhost:5174']);
  });

  it('the network file is plain agent data that other runtimes can load: no website_* references in tools', () => {
    for (const a of network.tools) for (const t of a.tools ?? []) expect(typeof t === 'string' ? t.startsWith('website_') : false).toBe(false);
    expect(network.tools[0].name).toBe(manifest.networks[0].front_man);
  });

  it('every tool reference is a local agent or an http(s) URL, as the reference kernel requires', () => {
    const names = new Set(network.tools.map((a: { name: string }) => a.name));
    for (const a of network.tools) for (const t of a.tools ?? []) expect(names.has(t) || /^https?:\/\//.test(t)).toBe(true);
  });

  it('the bindings name real actions, and every action is bound once', () => {
    const real = createActions({ data, today: data.department.sample_today, now: data.department.sample_now, reminders: new ReminderStore({ getItem: () => null, setItem: () => undefined }) }).map((a) => `website_${a.name}`);
    const bound = Object.values(ACTION_BINDINGS).flat();
    expect([...bound].sort()).toEqual([...real].sort());
    expect(ACTION_NAMES.map((n) => `website_${n}`).sort()).toEqual([...real].sort());
    expect(Object.keys(ACTION_BINDINGS).every((a) => network.tools.some((t: { name: string }) => t.name === a))).toBe(true);
    expect(manifest.actions.bindings).toEqual(ACTION_BINDINGS);
  });

  it('private context stays home: the front agent names no field that may leave', () => {
    expect(network.tools[0].allow).toEqual({ to_downstream: { sly_data: [] }, from_downstream: { sly_data: [] } });
  });

  it('instructions never contain the visitor saved class, because the site keeps it private', () => {
    const text = JSON.stringify(network);
    expect(text).not.toMatch(/student_section|student_year|"fee_category"/);
  });

  it('the front agent tells the model not to add a year, section or fee category', () => {
    expect(network.tools[0].instructions).toMatch(/Do not add a year, section or fee category/);
  });
});

describe('the published snapshot carries the same facts as the data', () => {
  it('has a line for every timetable day, change, notice, fee and exam', () => {
    const days = data.timetable.timetables.reduce((n, t) => n + WEEKDAYS.filter((d) => t.days[d]).length, 0);
    expect(timetableFacts(data)).toHaveLength(days + data.timetable.changes.length);
    expect(noticeFacts(data)).toHaveLength(data.notices.length);
    expect(feeFacts(data)).toHaveLength(data.fees.items.length);
    expect(examFacts(data)).toHaveLength(data.exams.exams.length + 1);
  });
  it('puts each fact in the specialist that owns it', () => {
    const by = (n: string) => network.tools.find((a: { name: string }) => a.name === n).instructions as string;
    expect(by('timetable_agent')).toContain('Timetable, Year 2 section A, Monday: 09:00-09:50 CS201 Data Structures (C-201)');
    expect(by('notices_agent')).toContain('Notice n-02');
    expect(by('fees_exams_agent')).toContain('Amounts: general Rs 42,500, scholarship Rs 0, sponsored Rs 21,250');
    expect(by('fees_exams_agent')).toContain('Exam, year 2, CS201 Data Structures, End-semester, Mon 14 Dec 2026');
    expect(by('timetable_agent')).not.toContain('Notice n-02');
  });
  it('marks the snapshot with its date and says when to use it', () => {
    expect(network.tools[1].instructions).toMatch(/Published snapshot \(sample data, as of Mon 16 Nov 2026\)\. Use it only when you have no website_\* tools/);
  });
});

describe('the "For agents" page checks', () => {
  it('pass for the published files', () => {
    const checks = runChecks(manifest, network, true);
    expect(checks.filter((c) => c.status === 'fail')).toEqual([]);
    expect(checks.some((c) => /Private context is deny by default/.test(c.text))).toBe(true);
    expect(checks.some((c) => /allowed_peers/.test(c.text))).toBe(true);
  });
  it('fail when a peer is not listed', () => {
    const m = structuredClone(manifest);
    m.allowed_peers = [];
    expect(runChecks(m, network, true).some((c) => c.status === 'fail' && /not in allowed_peers/.test(c.text))).toBe(true);
  });
  it('fail for a broken network', () => {
    const n = structuredClone(network);
    n.tools[1].tools = ['campus_desk'];
    expect(runChecks(manifest, n, true).some((c) => c.status === 'fail' && /cycle/.test(c.text))).toBe(true);
  });
  it('fail when the runtime file is missing', () => expect(runChecks(manifest, network, false).some((c) => c.status === 'fail' && /runtime file/.test(c.text))).toBe(true));
});

describe('project hygiene', () => {
  it('has an Apache 2.0 license, because the rules want the project open source', () => {
    expect(readFileSync(join(root, 'LICENSE'), 'utf8')).toMatch(/Apache License\s+Version 2.0/);
    expect(readJson('package.json').license).toBe('Apache-2.0');
  });
});
