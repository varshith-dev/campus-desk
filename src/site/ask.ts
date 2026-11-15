// The Ask page: chat, AI settings, activity list, reminders.
import { AgentRuntime, PRESETS, ProfileStore, Trace, chooseRouter, makeByokClient, validateManifest, validateNetwork } from '@aw/runtime';
import type { LlmClient, Manifest, NetworkDef, RuntimeEvent } from '@aw/runtime';
import { formatDate } from '../data/model';
import type { CampusData, Profile } from '../data/model';
import { createActions, slyFromProfile } from './actions';
import { confirmDialog, consentDialog } from './dialogs';
import { DemoModel } from './demo-model';
import { ReminderStore, toIcs } from './reminders';
import { ProfileState } from './state';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export interface AskEnv {
  data: CampusData;
  base: string;
  today: string;
  now: string;
  profileState: ProfileState;
  storage: Storage;
}

export function describeEvent(e: RuntimeEvent): { kind: string; text: string; tone?: 'bad' | 'warn' } | null {
  switch (e.type) {
    case 'router':
      return { kind: 'Model', text: e.label };
    case 'agent_start':
      return { kind: 'Agent', text: `${e.agent} started${e.network ? ` (${e.network})` : ''}` };
    case 'tool_call':
      return { kind: e.kind === 'action' ? 'Action' : e.kind === 'peer' ? 'Other site' : 'Hand off', text: `${e.agent} calls ${e.tool}` };
    case 'tool_result':
      return e.ok ? null : { kind: 'Failed', text: `${e.tool}: ${e.summary}`, tone: 'bad' };
    case 'consent':
      return { kind: 'Consent', text: `${e.origin}: ${e.decision}`, tone: e.decision === 'denied' ? 'bad' : undefined };
    case 'confirm':
      return { kind: 'Confirm', text: `${e.action}: ${e.decision}`, tone: e.decision === 'declined' ? 'warn' : undefined };
    case 'receipt':
      return { kind: 'Receipt', text: `${e.action} ${e.status} (${e.requestId})`, tone: e.status === 'succeeded' ? undefined : 'bad' };
    case 'peer_loaded':
      return { kind: 'Other site', text: `Loaded ${e.network} from ${e.origin}, ${e.agents} agents, running in this browser` };
    case 'private_context':
      return { kind: 'Private', text: e.withheld.length ? `Kept from the other site: ${e.withheld.join(', ')}` : 'Nothing private to hold back' };
    case 'limit':
      return { kind: 'Limit', text: e.detail, tone: 'warn' };
    case 'error':
      return { kind: 'Error', text: e.message, tone: 'bad' };
    default:
      return null;
  }
}

export async function initAsk(env: AskEnv): Promise<void> {
  const { data, base, today, now } = env;
  const log = $('log');
  const form = $<HTMLFormElement>('composer');
  const msg = $<HTMLTextAreaElement>('msg');
  const send = $<HTMLButtonElement>('send');
  const stop = $<HTMLButtonElement>('stop');
  const activity = $('activity');
  const aiStore = new ProfileStore(env.storage);
  const reminders = new ReminderStore(env.storage);

  const addMessage = (who: 'user' | 'bot', text: string, error = false): HTMLElement => {
    const div = document.createElement('div');
    div.className = `msg ${who}${error ? ' error' : ''}`;
    const label = document.createElement('span');
    label.className = 'who';
    label.textContent = who === 'user' ? 'You' : 'Campus Desk';
    const body = document.createElement('span');
    body.className = 'text';
    body.textContent = text;
    div.append(label, body);
    log.append(div);
    log.scrollTop = log.scrollHeight;
    return div;
  };

  // Load the published files the same way another site would.
  const manifest = (await (await fetch(new URL('agent-manifest.json', base))).json()) as Manifest;
  const entry = manifest.networks[0]!;
  const network = (await (await fetch(new URL(entry.hocon, base))).json()) as NetworkDef;
  const mv = validateManifest(manifest);
  const nv = validateNetwork(network, entry.front_man);
  if (!mv.ok || !nv.ok) {
    addMessage('bot', `The published agent network did not load: ${[...mv.errors, ...nv.errors].join('; ')}`, true);
    send.disabled = true;
    return;
  }

  function currentLlm(): { llm: LlmClient; text: string } {
    const stored = aiStore.load();
    const choice = chooseRouter(manifest, stored);
    if (choice.kind === 'byok' && stored) {
      const preset = PRESETS.find((p) => p.id === stored.presetId);
      return { llm: makeByokClient(choice, stored.apiKey), text: `Your key, ${preset?.name ?? 'custom router'}, model ${choice.model}. The key stays in this browser.` };
    }
    return { llm: new DemoModel({ today, office: `${data.department.office.place}, ${data.department.office.hours}, ${data.department.office.email}.` }), text: 'Demo mode: a small rule-based model that runs in this page, no key. It understands a fixed set of questions. Add a key for open-ended ones.' };
  }

  function refreshMode(): void {
    const { llm, text } = currentLlm();
    $('mode').textContent = llm.kind === 'demo' ? 'Demo mode, no key' : 'Using your key';
    $('mode-text').textContent = text;
  }

  // ---- Activity ----
  const trace = new Trace(() => {
    const k = aiStore.load()?.apiKey;
    return k ? [k] : [];
  });
  let activeOut: HTMLElement | null = null;
  trace.on((e) => {
    if (e.type === 'model_call' && e.agent === entry.front_man && activeOut) activeOut.textContent = '';
    const d = describeEvent(e);
    if (!d) return;
    const li = document.createElement('li');
    if (d.tone) li.className = d.tone;
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = d.kind;
    const text = document.createElement('span');
    text.textContent = d.text;
    li.append(kind, text);
    activity.append(li);
    activity.scrollTop = activity.scrollHeight;
  });

  // ---- Reminders ----
  function renderReminders(): void {
    const list = reminders.list();
    const ul = $('reminders');
    ul.replaceChildren();
    if (!list.length) {
      const li = document.createElement('li');
      li.textContent = 'None yet. Ask the agent to remind you of a date.';
      ul.append(li);
    }
    for (const r of list) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = `${r.title}, ${formatDate(r.date)}${r.time ? ' ' + r.time : ''}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Remove';
      btn.setAttribute('aria-label', `Remove reminder ${r.title}`);
      btn.addEventListener('click', () => {
        reminders.remove(r.id);
        renderReminders();
      });
      li.append(span, btn);
      ul.append(li);
    }
    $('download-ics').hidden = list.length === 0;
  }
  $('download-ics').addEventListener('click', () => {
    const blob = new Blob([toIcs(reminders.list())], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'campus-desk-reminders.ics';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---- Settings dialog ----
  const settings = $<HTMLDialogElement>('settings');
  const provider = $<HTMLSelectElement>('provider');
  const baseUrl = $<HTMLInputElement>('base-url');
  const model = $<HTMLInputElement>('model');
  const apiKey = $<HTMLInputElement>('api-key');
  provider.replaceChildren(...PRESETS.map((p) => Object.assign(document.createElement('option'), { value: p.id, textContent: p.name })));
  const applyPreset = () => {
    const p = PRESETS.find((x) => x.id === provider.value)!;
    baseUrl.value = p.baseUrl;
    model.value = p.model;
    $('key-hint').textContent = p.keyHint;
  };
  provider.addEventListener('change', applyPreset);
  $('open-settings').addEventListener('click', () => {
    const s = aiStore.load();
    provider.value = s?.presetId ?? 'gemini';
    applyPreset();
    if (s) {
      baseUrl.value = s.baseUrl;
      model.value = s.model;
    }
    apiKey.value = '';
    apiKey.placeholder = s ? 'A key is stored. Leave blank to keep it.' : '';
    settings.showModal();
  });
  $<HTMLFormElement>('settings-form').addEventListener('submit', (ev) => {
    const submitter = (ev as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.value !== 'save') return;
    const old = aiStore.load();
    const key = apiKey.value.trim() || old?.apiKey || '';
    if (!key) {
      ev.preventDefault();
      $('key-hint').textContent = 'Paste a key first, or choose demo mode.';
      return;
    }
    try {
      const u = new URL(baseUrl.value);
      if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error('not https');
    } catch {
      ev.preventDefault();
      $('key-hint').textContent = 'The router URL must be a full https address (http only for localhost).';
      return;
    }
    aiStore.save({ presetId: provider.value, baseUrl: baseUrl.value.trim(), model: model.value.trim(), apiKey: key });
    apiKey.value = '';
    refreshMode();
  });
  const dropKey = () => {
    aiStore.clear();
    apiKey.value = '';
    refreshMode();
    settings.close();
  };
  $('use-demo').addEventListener('click', dropKey);
  $('delete-key').addEventListener('click', dropKey);

  // ---- Examples ----
  const examples = ((network.metadata?.sample_queries as string[] | undefined) ?? []).slice(0, 8);
  const exUl = $('examples');
  for (const q of examples) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = q;
    b.addEventListener('click', () => {
      msg.value = q;
      form.requestSubmit();
    });
    li.append(b);
    exUl.append(li);
  }

  // ---- Chat ----
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let abort: AbortController | null = null;

  async function ask(text: string): Promise<void> {
    $('starter').hidden = true;
    addMessage('user', text);
    {
      const li = document.createElement('li');
      li.className = 'asked';
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = 'Asked';
      const t = document.createElement('span');
      t.textContent = text.length > 70 ? `${text.slice(0, 70)}...` : text;
      li.append(kind, t);
      activity.append(li);
      activity.scrollTop = activity.scrollHeight;
    }
    const bot = addMessage('bot', '');
    const out = bot.querySelector('.text') as HTMLElement;
    bot.setAttribute('aria-busy', 'true');
    send.disabled = true;
    stop.hidden = false;
    abort = new AbortController();
    const profile: Profile = env.profileState.load();
    const { llm } = currentLlm();
    const actions = createActions({ data, today, now, reminders });
    const runtime = new AgentRuntime({
      manifest,
      siteOrigin: location.origin,
      network,
      networkName: entry.name,
      frontMan: entry.front_man,
      llm,
      actions,
      actionBindings: manifest.actions?.bindings as Record<string, string[]> | undefined,
      sly: slyFromProfile(profile),
      consent: consentDialog,
      confirm: confirmDialog,
      trace,
      onText: (d) => {
        out.textContent += d;
        log.scrollTop = log.scrollHeight;
      },
    });
    activeOut = out;
    try {
      const res = await runtime.run(text, history, abort.signal);
      out.textContent = res.text || 'I have no answer for that.';
      history.push({ role: 'user', content: text }, { role: 'assistant', content: out.textContent });
      renderReminders();
    } catch (err) {
      if ((err as Error).name === 'AbortError') out.textContent = 'Stopped.';
      else {
        bot.classList.add('error');
        out.textContent = err instanceof Error ? err.message : String(err);
      }
    } finally {
      bot.removeAttribute('aria-busy');
      send.disabled = false;
      stop.hidden = true;
      abort = null;
      msg.focus();
    }
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = msg.value.trim();
    if (!text || abort) return;
    msg.value = '';
    void ask(text);
  });
  msg.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });
  stop.addEventListener('click', () => abort?.abort());

  refreshMode();
  renderReminders();
  const q = new URLSearchParams(location.search);
  if (q.get('q')) {
    msg.value = q.get('q')!.slice(0, 600);
    if (q.get('go') === '1') form.requestSubmit();
    else msg.focus();
  }
}
