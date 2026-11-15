// Full HTML pages. Built once at build time with the default class, then refreshed in the browser for the saved class.
import { DEFAULT_PROFILE, formatDate } from '../data/model';
import type { CampusData } from '../data/model';
import { esc, profileOptions, renderDueSoon, renderExams, renderFees, renderGraphSvg, renderNoticeList, renderToday, renderWeek, CATEGORY_LABEL } from './render';
import type { GraphNetwork, View } from './render';

export type PageId = 'home' | 'timetable' | 'notices' | 'fees' | 'ask' | 'agents';

const NAV: Array<{ id: PageId; href: string; label: string }> = [
  { id: 'home', href: 'index.html', label: 'Home' },
  { id: 'timetable', href: 'timetable.html', label: 'Timetable' },
  { id: 'notices', href: 'notices.html', label: 'Notices' },
  { id: 'fees', href: 'fees-exams.html', label: 'Fees and exams' },
  { id: 'ask', href: 'ask.html', label: 'Ask' },
  { id: 'agents', href: 'agents.html', label: 'For agents' },
];

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

export function defaultView(data: CampusData): View {
  return { data, profile: DEFAULT_PROFILE, today: data.department.sample_today, now: data.department.sample_now };
}

function layout(v: View, page: PageId, title: string, main: string, extraScript = ''): string {
  const d = v.data.department;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(CSP)}">
<title>${esc(title)} | Campus Desk</title>
<meta name="description" content="Campus Desk publishes the ${esc(d.department)} (sample data) as an open agentic website: timetable, notices, fee and exam dates, with agents anyone can call.">
<link rel="stylesheet" href="styles.css">
<link rel="alternate" type="application/json" href="agent-manifest.json" title="Agent manifest">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
</head>
<body data-page="${page}">
<a class="skip" href="#main">Skip to the main content</a>
<header class="site-header">
  <div class="bar">
    <a class="brand" href="index.html"><span class="mark" aria-hidden="true">CD</span><span><strong>Campus Desk</strong><span class="sub">${esc(d.short)}, ${esc(d.semester)}</span></span></a>
    <nav aria-label="Main">
      <ul>${NAV.map((n) => `<li><a href="${n.href}"${n.id === page ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`).join('')}</ul>
    </nav>
  </div>
  <form class="profile" id="profile" aria-label="Your class. Saved in this browser only.">
    <span class="profile-title">Your class</span>
    <span id="profile-fields">${profileOptions(v)}</span>
    <span class="clock" title="The sample site clock is fixed so the demo gives the same answers every time.">Sample clock: ${esc(formatDate(v.today))}, ${esc(v.now.split('T')[1] ?? '')}</span>
  </form>
</header>
<section class="sample-note" aria-label="Sample data notice"><strong>Sample data.</strong> ${esc(d.disclaimer)}</section>
<main id="main" tabindex="-1">
${main}
</main>
<footer class="site-footer">
  <p>Campus Desk is open source (Apache 2.0). It follows the Open Agentic Web minimum profile: a published manifest, a data-only agent network, a browser runtime and bring-your-own-key model settings.</p>
  <p><a href="agent-manifest.json">agent-manifest.json</a> | <a href="${'campus_desk.network.json'}">campus_desk.network.json</a> | <a href="agents.html">How other sites call it</a></p>
</footer>
<script type="module" src="js/site.js"></script>${extraScript}
</body>
</html>
`;
}

export function homePage(v: View): string {
  const d = v.data.department;
  return layout(
    v,
    'home',
    'Home',
    `<section class="hero">
  <p class="eyebrow">${esc(d.institute)}</p>
  <h1>Your department, answered in one place</h1>
  <p class="lead">Ask for today's classes, a fee due date or the latest exam notice in plain words. Campus Desk is a few small agents that run in your browser, and any other agentic site can call them too.</p>
  <p class="cta"><a class="btn primary" href="ask.html">Ask Campus Desk</a> <a class="btn" href="agents.html">See what agents can call</a></p>
</section>
<div class="grid two">
  <section class="card" aria-labelledby="h-today"><h2 id="h-today">Today</h2><div id="today">${renderToday(v)}</div></section>
  <section class="card" aria-labelledby="h-due"><h2 id="h-due">Coming up</h2><div id="due">${renderDueSoon(v)}</div><p><a href="fees-exams.html">All fees and exams</a></p></section>
  <section class="card wide" aria-labelledby="h-latest"><h2 id="h-latest">Latest notices</h2><div id="latest">${renderNoticeList(v, { limit: 3 })}</div><p><a href="notices.html">All notices</a></p></section>
</div>
<section class="try" aria-labelledby="h-try">
  <h2 id="h-try">Try asking</h2>
  <ul class="chips">
    ${['What is my next class?', 'Is my Wednesday class on?', 'When is the tuition fee due, and what is the late fee?', 'Is the library open late during exams?']
      .map((q) => `<li><a class="chip" href="ask.html?q=${encodeURIComponent(q)}">${esc(q)}</a></li>`)
      .join('')}
  </ul>
</section>`,
  );
}

export function timetablePage(v: View): string {
  return layout(
    v,
    'timetable',
    'Timetable',
    `<h1>Timetable</h1>
<p class="lead">This week for your class. Cancelled and moved classes are marked.</p>
<form class="viewer" id="viewer" aria-label="View another class">
  <label>Year <select name="year" id="view-year">${v.data.department.years.map((y) => `<option value="${y}"${y === v.profile.year ? ' selected' : ''}>Year ${y}</option>`).join('')}</select></label>
  <label>Section <select name="section" id="view-section">${v.data.department.sections.map((s) => `<option value="${esc(s)}"${s === v.profile.section ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
  <span class="hint">Changing these only changes this view. Use "Your class" above to change what the agents answer for.</span>
</form>
<h2 class="sr-only">This week</h2>
<div id="week" aria-live="polite">${renderWeek(v, v.profile.year, v.profile.section)}</div>`,
  );
}

export function noticesPage(v: View): string {
  const cats = Object.entries(CATEGORY_LABEL);
  return layout(
    v,
    'notices',
    'Notices',
    `<h1>Notices</h1>
<p class="lead">Newest first. Each notice has an id that agents quote, so you can find it here.</p>
<form class="filters" id="notice-filters" role="search" aria-label="Filter notices">
  <label class="search">Search <input type="search" id="q" name="q" placeholder="exam, fee, library" autocomplete="off"></label>
  <fieldset><legend>Topic</legend>
    <button type="button" class="pill" data-cat="" aria-pressed="true">All</button>
    ${cats.map(([k, l]) => `<button type="button" class="pill" data-cat="${esc(k)}" aria-pressed="false">${esc(l)}</button>`).join('')}
  </fieldset>
  <label class="check"><input type="checkbox" id="all-years"> Show every year</label>
</form>
<h2 class="sr-only">Results</h2>
<div id="notice-list" aria-live="polite">${renderNoticeList(v)}</div>`,
  );
}

export function feesPage(v: View): string {
  return layout(
    v,
    'fees',
    'Fees and exams',
    `<h1>Fees and exams</h1>
<p class="lead">Amounts and dates for your year and fee category. Late fees are listed so there are no surprises.</p>
<section aria-labelledby="h-fees"><h2 id="h-fees">Fees</h2><div id="fees" class="table-wrap">${renderFees(v)}</div></section>
<section aria-labelledby="h-exams"><h2 id="h-exams">Exams</h2><div id="exams" class="table-wrap">${renderExams(v)}</div></section>`,
  );
}

export function askPage(v: View): string {
  return layout(
    v,
    'ask',
    'Ask',
    `<h1>Ask Campus Desk</h1>
<div class="ask">
  <section class="chat" aria-labelledby="h-chat">
    <h2 id="h-chat" class="sr-only">Conversation</h2>
    <div id="mode" class="mode" role="status"></div>
    <div id="log" class="log" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Conversation with Campus Desk"></div>
    <div id="starter" class="starter">
      <p>Try one of these:</p>
      <ul class="chips" id="examples"></ul>
    </div>
    <form id="composer" class="composer">
      <label for="msg">Your question</label>
      <div class="row">
        <textarea id="msg" name="msg" rows="2" maxlength="600" placeholder="For example: when is the tuition fee due?" required></textarea>
        <button type="submit" class="btn primary" id="send">Send</button>
        <button type="button" class="btn" id="stop" hidden>Stop</button>
      </div>
    </form>
  </section>
  <aside class="side" aria-label="Settings and activity">
    <section class="card" aria-labelledby="h-ai">
      <h2 id="h-ai">Model</h2>
      <p id="mode-text" class="hint"></p>
      <p><button type="button" class="btn" id="open-settings">AI settings</button></p>
    </section>
    <section class="card" aria-labelledby="h-activity">
      <h2 id="h-activity">What happened</h2>
      <p class="hint">Every agent call, site action, contact with another site and private-context decision shows here. Keys never do.</p>
      <ol id="activity" class="activity" aria-live="polite" tabindex="0" aria-label="Activity list"></ol>
    </section>
    <section class="card" aria-labelledby="h-rem">
      <h2 id="h-rem">Reminders</h2>
      <ul id="reminders" class="reminders"></ul>
      <p><button type="button" class="btn" id="download-ics" hidden>Download calendar file</button></p>
    </section>
  </aside>
</div>

<dialog id="settings" aria-labelledby="settings-title">
  <form method="dialog" id="settings-form" class="dlg">
    <h2 id="settings-title">AI settings</h2>
    <p>By default Campus Desk answers with a small demo model that runs in this page. For open-ended questions, bring your own key. It stays in this browser and is sent only to the router you pick.</p>
    <label>Provider <select id="provider" name="provider"></select></label>
    <label>Router URL <input id="base-url" name="base" type="url" autocomplete="off" spellcheck="false"></label>
    <label>Model <input id="model" name="model" type="text" autocomplete="off" spellcheck="false"></label>
    <label>API key <input id="api-key" name="key" type="password" autocomplete="off" spellcheck="false"></label>
    <p class="hint" id="key-hint"></p>
    <p class="hint">The router must allow calls from a browser page. Anyone who can run scripts on this page could read a stored key, so use a key with a low limit.</p>
    <div class="actions">
      <button class="btn primary" value="save" id="save-settings">Save and use this key</button>
      <button class="btn" value="demo" id="use-demo" type="button">Use demo mode</button>
      <button class="btn danger" value="delete" id="delete-key" type="button">Delete stored key</button>
      <button class="btn" value="cancel" formnovalidate>Close</button>
    </div>
  </form>
</dialog>

<dialog id="consent" aria-labelledby="consent-title">
  <form method="dialog" class="dlg">
    <h2 id="consent-title">Allow another site to run here?</h2>
    <p id="consent-text"></p>
    <dl class="facts">
      <dt>Site</dt><dd id="consent-origin"></dd>
      <dt>What it gets</dt><dd id="consent-sent"></dd>
      <dt>What it never gets</dt><dd>Your model key, your saved class, your fee category, or this chat.</dd>
    </dl>
    <div class="actions">
      <button class="btn primary" value="allow" id="consent-allow">Allow once</button>
      <button class="btn" value="allow_session" id="consent-session">Allow for this visit</button>
      <button class="btn" value="deny" id="consent-deny">Do not allow</button>
    </div>
  </form>
</dialog>

<dialog id="confirm" aria-labelledby="confirm-title">
  <form method="dialog" class="dlg">
    <h2 id="confirm-title">Confirm this change</h2>
    <p id="confirm-text"></p>
    <dl class="facts"><dt>Action</dt><dd id="confirm-action"></dd><dt>Where</dt><dd id="confirm-origin"></dd><dt>Details</dt><dd><code id="confirm-args"></code></dd></dl>
    <div class="actions">
      <button class="btn primary" value="yes" id="confirm-yes">Confirm</button>
      <button class="btn" value="no" id="confirm-no">Cancel</button>
    </div>
  </form>
</dialog>`,
  );
}

export function agentsPage(v: View, net: GraphNetwork, peerUrl: string | undefined, bindings: Record<string, string[]> = {}): string {
  const origin = '<span class="origin">https://your-site.example</span>';
  return layout(
    v,
    'agents',
    'For agents',
    `<h1>For agents and other sites</h1>
<p class="lead">Campus Desk is an open agentic website. The files below are public. Another site, or any client, can read them and run the same agents in its own browser.</p>

<section aria-labelledby="h-graph">
  <h2 id="h-graph">The agent network</h2>
  ${renderGraphSvg(net, 'campus_desk', bindings)}
  <p class="hint">Solid lines are agents in this network. Boxes under an agent are site actions. The dashed line is another site, used only after the visitor agrees.</p>
</section>

<section aria-labelledby="h-files">
  <h2 id="h-files">Public files</h2>
  <table class="data">
    <caption>What this site publishes</caption>
    <thead><tr><th scope="col">File</th><th scope="col">What it is</th></tr></thead>
    <tbody>
      <tr><th scope="row"><a href="agent-manifest.json">agent-manifest.json</a></th><td>Index of networks: name, front agent, location, router metadata, peer policy.</td></tr>
      <tr><th scope="row"><a href="campus_desk.network.json">campus_desk.network.json</a></th><td>The data-only agent network: four agents, their instructions and schemas.</td></tr>
      <tr><th scope="row"><a href="links.json">links.json</a></th><td>Default peer bindings.</td></tr>
      <tr><th scope="row"><a href="runtime/agentic-runtime.js">runtime/agentic-runtime.js</a></th><td>The browser runtime, an ES module. It validates, runs the agent loop, asks for consent and applies limits.</td></tr>
      <tr><th scope="row"><a href="data/department.json">data/*.json</a></th><td>The sample department data the site actions read.</td></tr>
    </tbody>
  </table>
</section>

<section aria-labelledby="h-check">
  <h2 id="h-check">Live check in your browser</h2>
  <p>These checks run now, in this page, against the files above using the same validators the runtime uses.</p>
  <ul id="checks" class="checks" aria-live="polite"><li>Running checks</li></ul>
</section>

<section aria-labelledby="h-call">
  <h2 id="h-call">Call these agents from another site</h2>
  <p>The network URL is the folder with <code>agent-manifest.json</code>, then the network name. Add it to an agent's <code>tools</code>, and add this origin to your manifest's <code>allowed_peers</code>.</p>
  <pre class="code" tabindex="0"><code>// in your agent network, on the agent that should ask Campus Desk
"tools": ["<span class="origin">https://your-site.example</span>/campus_desk"]

// in your agent-manifest.json
"allowed_peers": ["<span class="origin">https://your-site.example</span>"]</code></pre>
  <p>The network runs in the caller's browser with the caller's model and key. This site never sees the key. Because this is a static site, the caller gets the published snapshot of the data, which each specialist carries in its instructions. Live site actions stay on this origin.</p>
  <p class="hint">Network URL for this site: ${origin}/campus_desk</p>
</section>

<section aria-labelledby="h-rules">
  <h2 id="h-rules">What the runtime promises</h2>
  <ul class="plain">
    <li>It rejects a malformed network, a missing agent, a bad front agent, a cycle or a coded tool before any model call.</li>
    <li>It asks the visitor before it contacts any other origin, and names the origin and the purpose.</li>
    <li>A model key is attached only to requests to the router the visitor chose. It is not put in URLs, manifests, prompts, actions or the activity list.</li>
    <li>Private context (year, section, fee category) goes to site actions, not to prompts, and not to other sites unless a network names the field.</li>
    <li>It stops on depth, agent calls, calls to other sites and time, and says so on screen.</li>
    <li>A write needs the visitor's confirmation. A write with an unknown outcome is reported as unknown and not repeated.</li>
  </ul>
  ${peerUrl ? `<p class="hint">In this build, the library peer is <code>${esc(peerUrl)}</code>.</p>` : '<p class="hint">This build publishes no peer link.</p>'}
</section>`,
  );
}
