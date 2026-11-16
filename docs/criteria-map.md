# Criteria map

This maps everything the Open Agentic Web Challenge asks for to a feature, a file and a check you can run. Sources: the Devpost page, its rules and FAQ, and the Open Agentic Web minimum specification (MVP Profile 0.2), read on 15 Nov 2026. Re-read them before you submit, because rules can change.

Status words are plain. **Done and tested** means a test or browser check fails if it breaks. **Done, not run live** means built and tested against stand-ins only. **Needs you** means it needs your account or your voice.

## Stage 1: pass or fail

| Requirement | Feature | Files | Check | Status |
|---|---|---|---|---|
| A public site that is a conforming open agentic website | The Next.js app serves the manifest, network, links, runtime and a human UI | `app/`, `public/`, `next.config.ts` | `npm run check` (14 checks on `public/`), `npm run check:live` (same, on the running site) | Done and tested. Needs a public URL: **needs you** (see `docs/deploy.md`) |
| A conforming `.json` agent network | `campus_desk.network.json`: four agents, data only, no coded tools | `network/campus-desk.ts`, `scripts/build-network.ts`, `public/campus_desk.network.json` | `tests/published-files.test.ts` (the committed file equals a fresh build), `tests/interop.test.ts` | Done and tested. The hand-run reference validator (nsdeploy) passed on the earlier build, so run it again on this one |
| A `runtime` file that runs the network in the browser | `runtime/agentic-runtime.js`, named in the manifest. The Ask page loads this exact file, not a private copy | `src/runtime/*`, `scripts/build-runtime.ts`, `lib/client/runtime.ts` | The Agents page runs the runtime's own validators in the visitor's browser. e2e: "the published runtime runs the live checks and all pass" | Done and tested |
| A user and agent interface | Ask page (chat, "What ran" panel, confirm and consent cards). Activity page for the agent side | `components/ask/ask-client.tsx`, `components/activity/activity-client.tsx` | e2e: 53 checks in real Chrome | Done and tested |
| Optional LLM and key configuration UI | AI settings: Gemini, Otari, other OpenAI-compatible routers, custom. No key means the demo model. Key stays in the browser | `src/runtime/byok.ts`, `src/runtime/llm.ts`, settings dialog in `ask-client.tsx` | e2e against a fake router records every request: the key goes to the chosen router only and never into the page text, activity or a peer request | Done and tested against a fake router. **Done, not run live** for Gemini and Otari |
| The network can interact with the site and/or other agentic sites | Six site actions on this origin (server code). A second site, the library desk, runs here after consent. A third path: outside agents call the live tools with a grant | `lib/tools.ts`, `src/site/actions.ts`, `src/runtime/peer.ts`, `peer/library-desk/` | e2e: consent card before contact, Deny stops it, Allow runs it. e2e: outside agent calls tools over REST and MCP | Done and tested between two local ports. Two real HTTPS hosts: **needs you** |
| A text description | `submission.md` | `submission.md` | Read it once for brackets | Needs you to paste it into Devpost |
| A YouTube video under 2 minutes, in the entrant's own voice, not AI generated | Script and timings are ready | `demo-script.md` | none possible | **Needs you.** Your voice, your recording, your upload |
| Screenshots | 17 screenshots from the built app | `docs/screenshots/` (`npm run screenshots`) | Regenerated from the live app, so they match the code | Done. Retake from the live URL once deployed if you can |
| Open source, English, free to test | Apache 2.0. Demo mode needs no key and no payment. The demo student needs no sign-up | `LICENSE`, `NOTICE` | none | A public repo: **needs you** |
| New project inside the submission period (11 Nov 2026 to 11 Jan 2027) | Started 15 Nov 2026. History is in git | `git log` | none | Done |

## Stage 2: the four criteria (25 percent each, ties broken in this order)

### Technological Implementation

| What a judge looks for | What is built | Files | Proof |
|---|---|---|---|
| Real working backend, not a mock | Next.js route handlers over a SQLite or Turso (libSQL) database. Seeded department data, students, sessions, reminders, access requests, grants and a ledger | `app/api/**`, `lib/db.ts`, `lib/store.ts` | `tests/server.test.ts` (21 tests on a real database file), e2e |
| APIs | 24 routes plus the public key file: tools (REST and MCP), grants, ledger, receipts, auth, reminders, profile, health, SSE stream | `app/api/**` | e2e hits them over HTTP, including CORS preflight from the library origin |
| Database | 13 tables, created and seeded on first start. Same code on a local file and on hosted Turso | `lib/db.ts`, `data/seed/*.json`, `scripts/seed-data.mjs` | `tests/data-actions.test.ts`: the data read back from the database equals the seed files |
| Auth where it fits | Guest session by default (cookie, hash stored). Optional account for personal reminders: scrypt passphrase hashing, rate-limited sign-in, one error for wrong email and wrong passphrase, guest reminders merge on sign-in | `lib/crypto.ts`, `lib/store.ts`, `lib/http.ts`, `proxy.ts`, `app/api/auth/*` | `tests/server.test.ts` (passwords and sessions), e2e (sign-in, sign-up, sign-out, merge) |
| Agent logic | Bounded loop, schema checks, confirm cards, consent before peers, private-context filter, peers treated as untrusted text, MCP client, WebMCP registration for read actions | `src/runtime/engine.ts`, `peer.ts`, `schema.ts`, `mcp.ts`, `webmcp.ts` | `tests/engine.test.ts`, `peer-llm.test.ts`, `interop.test.ts` (all seven spec checks) |
| Integrations | Library peer site (cross-origin, with its own network). Study planner calls Campus Desk from another origin. MCP over HTTP. Gemini, Otari or any OpenAI-compatible router | `peer/library-desk/`, `scripts/build-peer.ts`, `app/api/mcp/route.ts` | e2e: the real study planner page asks, the student approves, it reads exam dates. The runtime's own `McpClient` lists and calls tools |
| Security | Signed grants and receipts (Ed25519), scoped, expiring and revocable. Nonce CSP, framing blocked, strict CORS on public files only, rate limits, no student id or private value in any receipt | `lib/grants.ts`, `lib/ledger.ts`, `proxy.ts`, `next.config.ts` | `tests/server.test.ts` (tamper, forged token, wrong origin, expiry, revoke), e2e (headers, forged token, revoke) |
| Deployment config | `vercel.json`, `apphosting.yaml`, `.env.example`, `docs/deploy.md` | root files | Build is the same `next build` that e2e runs. Not deployed |
| Tests | 181 unit and interop tests, 53 browser checks, 14 conformance checks, a style check, strict types | `tests/`, `scripts/e2e.mjs`, `tools/agentic-check.ts`, `scripts/check-style.mjs` | `npm run build`, `npm run e2e` |
| A live-demo-ready build | `npm run build:site && npm run build:peer`, then `npm start` and `npm run serve:peer` | `package.json` | e2e starts exactly these |

### Design

| What a judge looks for | What is built | Files | Proof |
|---|---|---|---|
| A real design system, not defaults | "Eastbrook": paper background with ruled lines, brick red, chalkboard green, mustard, pencil blue. Fraunces for headings, Hanken Grotesk for text, IBM Plex Mono for data. Stamp labels, punched ticket cards, receipt styling, chalkboard dark theme | `app/globals.css`, `components/desk/*`, `components/ui/*` (shadcn, restyled) | `docs/screenshots/` |
| Consistent spacing, type, tokens | Tailwind v4 theme tokens; one set of components | `app/globals.css` | Same |
| Every state | Loading skeletons, empty states (tape, reminders, requests), error states (unreachable router, network load failure, refused token) with retry, success toasts | `components/**` | e2e: unreachable router gives a readable error with a retry button |
| Motion that helps | Framer Motion on reveal, list entry and the live tape. Off under reduced motion | `components/desk/motion.tsx` | e2e: reduced motion run |
| Mobile first | Bottom bar with a More sheet, one panel at a time on Ask, no sideways scroll, 40 pixel tap targets | `components/desk/site-nav.tsx`, `ask-client.tsx` | e2e: phone width on every page |
| Accessible | Skip link, landmarks, labels, live regions, focus handling in dialogs, light and dark | all pages | e2e: axe-core, WCAG 2.1 AA, ten pages, both themes: 0 violations. No repeated ids on any page |

### Potential Impact (includes shared tools and services)

| What a judge looks for | What is built | Files | Proof |
|---|---|---|---|
| A real audience | Every college department has the same four questions and a site only a person can read. Students also get a say in who can read their schedule | `README.md`, `submission.md` | Read it |
| Shared tools and services for the community | `agentic-check`: tests any site's files against the spec, by folder or URL. A documented grant and receipt protocol other sites can copy. The visiting-agent CLI. The sample library peer and study planner as a template for a caller | `tools/agentic-check.ts`, `tools/visiting-agent.ts`, `docs/protocol.md`, `peer/library-desk/` | `tests/agentic-check.test.ts`, e2e runs `check:live` |
| Easy for another department to adopt | Replace `data/seed/*.json`, build, deploy | `docs/deploy.md`, `data/seed/` | `README.md` |
| Realistic about limits | Written down in `README.md` ("Honest limits") and `submission.md` | | |

### Quality of the Idea

| What a judge looks for | What is built | Files | Proof |
|---|---|---|---|
| Different from what judges have seen | Consent receipts. An outside agent has to ask with a pairing code, the student picks scopes and a time limit, the site signs a grant, each call is a hash-chained signed receipt, and the student can end access in one click. Receipts verify on a public page with the site's public key | `lib/grants.ts`, `lib/ledger.ts`, `app/activity`, `app/verify`, `app/.well-known/campus-desk-keys.json` | e2e: request, approve, read, tape, revoke, verify a receipt, fail an edited one |
| Sharp on the spec's own ideas | Private context deny by default, enforced on a server. Peers are untrusted text. Writes need a person, including writes proposed by outside agents, which stay pending until confirmed | `lib/tools.ts`, `app/reminders` | e2e: an outside write stays pending until the student confirms |

## Required technology, by name

The challenge names the open agentic web profile and its pieces. Our own stack choices are listed second.

| Technology | Where it is used |
|---|---|
| Open Agentic Web MVP Profile 0.2: manifest, data-only network, runtime, BYOK, consent | `network/`, `public/agent-manifest.json`, `src/runtime/` |
| Neuro SAN network format (JSON) | `public/campus_desk.network.json`, `peer/library-desk/library_desk.network.json` |
| Model Context Protocol | `app/api/mcp/route.ts` (server, JSON-RPC over HTTP POST), `src/runtime/mcp.ts` (client) |
| WebMCP | `src/runtime/webmcp.ts`: read actions only. Not tried in a browser that ships WebMCP |
| Otari | Preset in AI settings. Not run against the live service, so no Otari claim is made |
| Next.js 16 (App Router), React 19 | `app/`, `proxy.ts` |
| Tailwind CSS 4, shadcn/ui (Radix), Framer Motion | `app/globals.css`, `components/ui/`, `components/desk/motion.tsx` |
| SQLite and Turso (libSQL) | `lib/db.ts` |
| Ed25519 and scrypt (Node crypto), WebCrypto in the browser | `lib/crypto.ts`, `components/desk/verify-client.tsx` |
| Vercel or Firebase App Hosting | `vercel.json`, `apphosting.yaml` |

## Gaps that are closed, and gaps that remain

Closed in this build:

- The old site was static pages. It is now a server app with a database, sign-in, a live tool API and signed receipts.
- Another site used to get only a dated snapshot. It can now call the live tools with a grant the student approves.
- The old tests only covered static pages. 53 browser checks now cover every page, the whole hand-off, MCP and accessibility.

Remaining, and not hidden:

- **Not deployed.** No public URL, no repo, no Devpost entry, no video exist yet. These need you.
- **Gemini and Otari live paths** are untested. The own-key path is tested against a fake router.
- **Demo mode is rule based**, not a language model. It is labelled on the page.
- **Cross-site calls** are tested between two local ports, not two HTTPS hosts.
- **The grant and receipt protocol** is our own extension. The spec's minimum profile does not define site-to-site action calls, and the manifest says so.
- **The reference validator** (nsdeploy) has not been re-run on this build.
- **Rate limits** are per server instance. On a multi-instance host they are looser.
- **Chrome only** has been tested. Ed25519 in WebCrypto needs a recent Chrome, Safari or Firefox.
