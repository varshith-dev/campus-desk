// A small outside agent, for trying the live-tool hand-off from a terminal.
// Usage: npx tsx tools/visiting-agent.ts EB-XXXXXX [--base http://localhost:5173] [--origin https://my.site]
//
// It asks the student (by pairing code) for read access to the timetable and exam dates, waits for approval on the
// Activity page, then calls two tools, tries one it was not given (and is refused), and proposes a reminder that
// stays pending until the student confirms it.
export {};
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const code = args.find((a) => /^EB-/i.test(a));
const base = flag('--base', 'http://localhost:5173').replace(/\/$/, '');
const agentOrigin = flag('--origin', 'http://localhost:5174');

if (!code) {
  console.error('Usage: npx tsx tools/visiting-agent.ts EB-XXXXXX [--base URL] [--origin URL]\nThe code is on the Activity page of Campus Desk.');
  process.exit(2);
}

const say = (s: string) => console.log(s);
const post = async (path: string, body: unknown, token?: string) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: agentOrigin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};

say(`Asking ${base} for access as "Study planner (terminal)" from ${agentOrigin}`);
const req = await post('/api/agent/requests', { desk_code: code, agent_name: 'Study planner (terminal)', origin: agentOrigin, scopes: ['timetable:read', 'exams:read', 'reminders:propose'], reason: 'Find a free slot before each exam and propose a reminder' });
if (req.status !== 202) {
  console.error(`The request failed (${req.status}): ${req.body?.error?.message}`);
  process.exit(1);
}
say(`Request ${req.body.request_id} sent. Open the Activity page and approve it. Waiting up to 5 minutes...`);

let token: string | undefined;
for (let i = 0; i < 150 && !token; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const p = await (await fetch(`${base}/api/agent/requests/${req.body.request_id}`, { headers: { Authorization: `Bearer ${req.body.poll_secret}` } })).json();
  if (p.status === 'declined') {
    say('The student declined. Nothing was shared.');
    process.exit(0);
  }
  if (p.token) {
    token = p.token;
    say(`Approved. Scopes: ${p.grant.scopes.join(', ')}. Valid until ${p.grant.expires_at}.`);
  }
}
if (!token) {
  say('No answer in time.');
  process.exit(1);
}

const show = (label: string, r: { status: number; body: any }) => {
  if (r.status !== 200) return say(`${label}: refused (${r.status}) ${r.body?.error?.message}`);
  say(`${label}: ok, receipt ${r.body.receipt.id} #${r.body.receipt.hash.slice(0, 10)}`);
};
const tt = await post('/api/agent/tools/get_timetable', { args: { day: 'friday' } }, token);
show('get_timetable(friday)', tt);
if (tt.status === 200) for (const c of tt.body.result.classes) say(`  ${c.start} ${c.course} ${c.name} (${c.room})${c.status !== 'on' ? ' [' + c.status + ']' : ''}`);
const ex = await post('/api/agent/tools/get_exam_dates', { args: {} }, token);
show('get_exam_dates()', ex);
if (ex.status === 200) for (const e of ex.body.result.exams.slice(0, 3)) say(`  ${e.label} ${e.course} ${e.name}`);
show('get_fee_dates() (not granted)', await post('/api/agent/tools/get_fee_dates', { args: {} }, token));
const rem = await post('/api/agent/tools/save_reminder', { args: { title: 'Start revising Operating Systems', date: '2026-12-01', time: '18:00' } }, token);
show('save_reminder() proposal', rem);
if (rem.status === 200) say('  It is pending. The student confirms it on the Reminders page.');
