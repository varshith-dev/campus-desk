// Runs in the visitor's browser on the library site. It asks Campus Desk for read access with a pairing code,
// waits for the student to approve it on Campus Desk, then uses only what was granted.
const DESK = document.documentElement.dataset.desk;
const ORIGIN = location.origin;
const $ = (id) => document.getElementById(id);
const log = (text, kind = 'info') => {
  const li = document.createElement('li');
  li.className = kind;
  li.textContent = text;
  $('log').append(li);
  li.scrollIntoView({ block: 'nearest' });
};
const j = async (path, init) => {
  const res = await fetch(DESK + path, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};
const post = (path, body, token) => j(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });

// Published library facts, as written on this site.
const normalClose = '20:00';
const examWeek = { from: '2026-12-07', to: '2026-12-23', close: '22:00' };
const closeFor = (iso) => (iso >= examWeek.from && iso <= examWeek.to ? examWeek.close : normalClose);
const isSunday = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay() === 0;

function plan(exams) {
  return exams
    .filter((e) => e.date >= '2026-11-16')
    .slice(0, 3)
    .map((e) => {
      const d = new Date(e.date + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      let moved = false;
      // The library is closed on Sundays outside exam week, so use the Saturday before.
      if (isSunday(d.toISOString().slice(0, 10)) && d.toISOString().slice(0, 10) < examWeek.from) {
        d.setUTCDate(d.getUTCDate() - 1);
        moved = true;
      }
      const day = d.toISOString().slice(0, 10);
      return { exam: e, day, closes: closeFor(day), moved };
    });
}

$('go').addEventListener('click', async () => {
  const code = $('code').value.trim().toUpperCase();
  $('log').replaceChildren();
  $('result').hidden = true;
  if (!/^EB-[A-Z0-9]{6}$/.test(code)) return log('That does not look like a desk code. It reads EB- and six characters.', 'warn');
  $('go').disabled = true;
  try {
    log('Asking Campus Desk for read access to your exam dates only...');
    const req = await post('/api/agent/requests', { desk_code: code, agent_name: 'Library study planner', origin: ORIGIN, scopes: ['exams:read'], reason: 'Suggest a library slot before each exam' });
    if (req.status !== 202) return log('Campus Desk said no: ' + (req.body?.error?.message ?? req.status), 'warn');
    log('Waiting for you to approve this on the Activity page of Campus Desk. You can say no there.');
    let grant;
    for (let i = 0; i < 90 && !grant; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const p = await j('/api/agent/requests/' + req.body.request_id, { headers: { Authorization: 'Bearer ' + req.body.poll_secret } });
      if (p.body.status === 'declined') return log('You declined. Nothing was shared.', 'warn');
      if (p.body.token) grant = p.body;
    }
    if (!grant) return log('No answer in three minutes, so I stopped.', 'warn');
    log('Approved for ' + grant.grant.scopes.join(' and ') + '. Reading exam dates...', 'ok');
    const ex = await post('/api/agent/tools/get_exam_dates', { args: {} }, grant.token);
    if (ex.status !== 200) return log('Exam dates were refused: ' + ex.body?.error?.message, 'warn');
    const suggestions = plan(ex.body.result.exams);
    const ul = $('plans');
    ul.replaceChildren();
    for (const s of suggestions) {
      const li = document.createElement('li');
      const when = new Date(s.day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      li.textContent = `${s.exam.course} ${s.exam.name} on ${s.exam.label}: study at the library on ${when}${s.moved ? ' (the day before is a Sunday, when it is closed)' : ''}. It is open until ${s.closes}.`;
      ul.append(li);
    }
    $('result').hidden = false;
    log('Done. Every read is in your receipt list on Campus Desk, and you can revoke this access there.', 'ok');
  } catch (err) {
    log('Could not reach Campus Desk at ' + DESK + '. ' + (err instanceof Error ? err.message : ''), 'warn');
  } finally {
    $('go').disabled = false;
  }
});
