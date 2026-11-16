# Devpost submission: Campus Desk

Hackathon: Open Agentic Web Challenge (https://cognizant-agenticweb.devpost.com/)
Deadline: Mon Jan 11, 2027, 8:00 AM PST, which is Mon Jan 11, 2027, 9:30 PM IST.
Entry type: new project, built inside the Submission Period (Nov 11, 2026 to Jan 11, 2027). No existing code is reused.
Nothing has been registered, signed in, pushed, deployed or submitted. This folder is build and package only.

Text in [square brackets] is something only the person submitting can fill in. Do not submit with any bracket left in.

The full requirement-by-requirement map is in `docs/criteria-map.md`.

---

## Project name

Campus Desk

## Tagline (one line)

A college department website that other agents can use, but only with the student's yes: students ask in plain words, outside agents ask first, and every call is a signed receipt.

---

## What the rules ask for, and where we stand

Taken from the hackathon page, /rules, resources and FAQ, and the Open Agentic Web minimum specification (MVP Profile 0.2, 6 Nov 2026), read on Nov 15, 2026. Re-read them before you submit.

| Requirement | Status |
|---|---|
| Stage 1 pass/fail: a conforming open agentic website | Built. `npm run check` (our checker) passes 14 of 14 on `public/`, and `npm run check:live` passes on the running site. Needs a re-check on the live URL, and a re-run of the reference validator (nsdeploy) by hand. |
| Public URL of the site | Needs your account (hosting). See `docs/deploy.md`. |
| A conforming `.json` agent network file | Done: `campus_desk.network.json`, listed in `agent-manifest.json`. |
| A `runtime` file | Done: `runtime/agentic-runtime.js`, named in the manifest under `runtime.file`. The Ask page loads this exact file. |
| A user and agent interface | Done: the Ask page, with a "What ran" panel, and the Activity page for outside agents. |
| An optional LLM and key configuration UI | Done: AI settings (Gemini, Otari, OpenAI-compatible, custom), and a no-key demo mode. |
| The network can interact with the site and/or other agentic sites | Done: six site actions on this origin (server side), a second site (the library) that runs here after consent, and outside agents that call the live tools with a grant. |
| Text description | Below. |
| YouTube video under 2 minutes, public, shows a browser, entrant explains it, not AI generated, no trademarks or copyrighted music | Script is ready (`demo-script.md`). Needs your voice, recording and upload. |
| One or more screenshots | 17 in `docs/screenshots/`. |
| Open source, new or significantly updated, English, free to test until judging ends | Apache 2.0 licence is in the repo. Needs a public repo (your account). The site is free to use, and demo mode needs no key. |
| If Otari is used: account email and a short note on a problem and a suggested improvement | Not claimed. The Otari preset is in the settings but has not been run live. See the Otari section. |
| Optional: extra shared tools or services for the community | `agentic-check`, the grant and receipt protocol (`docs/protocol.md`), and `visiting-agent`. Described below. |
| Age of majority in your country of residence, not in a sanctioned place | You to confirm on the form. |

---

## Criteria-to-feature table

Stage 2 has four criteria, equally weighted at 25 percent each. Ties are broken in the order listed. Potential Impact explicitly rewards tools and services shared with the community.

| Criterion (25% each) | What the judges look for | Feature that answers it | Demo beat (see demo-script.md) | Where to check |
|---|---|---|---|---|
| Technological Implementation | A working, non-trivial site that really follows the spec | A Next.js server with 24 API routes over a SQLite or Turso database. Sign-in with scrypt-hashed passphrases. Our own browser runtime that validates before any model call, runs a bounded agent loop, checks arguments, owns the confirm card, loads a peer only after consent and filters private context. Ed25519-signed grants and a hash-chained receipt ledger. REST and MCP tool endpoints. 181 tests on a real database, 53 browser checks, a 14-check conformance tool | The access flow, 0:46 to 1:25 | `lib/`, `app/api/`, `src/runtime/`, `tests/server.test.ts`, `tests/interop.test.ts`, `npm run e2e` |
| Design | A complete, coherent, usable experience | "Eastbrook": a department-office look with its own palette, type and stamp, ticket and receipt shapes, not default components. Every state is designed: loading, empty, error, refused, expired. Light and dark, phone width with a bottom bar, reduced motion. axe-core finds no WCAG 2.1 AA violations on ten pages in either theme | Opening shots, the confirm card, the receipt tape | `docs/screenshots/`, `npm run e2e` (axe steps) |
| Potential Impact | A credible case for a real audience, with shared tools | Every college department has the same four questions and a website only a person can read. Students get a say in who else can read their schedule. A department edits four JSON files and deploys to a free host. `agentic-check` tests any site against the spec. The grant and receipt protocol is documented for others to copy | The closing 15 seconds, slide 7 | `tools/agentic-check.ts`, `docs/protocol.md`, `docs/deploy.md` |
| Quality of the Idea | Creative, and different from what exists | Consent receipts. An outside agent asks with a pairing code, the student picks scopes and a time limit, the site signs a scoped grant, each call becomes a signed, chained receipt, and one click ends the access. Receipts verify in the browser against the site's public key | The tape and the Verify button | `/activity`, `/verify`, `docs/protocol.md` |

---

## Inspiration

Ananya is in Year 2. Her timetable is a PDF, her fee dates are on a notice board, and last-minute changes arrive in group chats. A department website has all of it, but only a person scrolling can use it. The Open Agentic Web idea is that a site publishes agents as plain data and any browser can run them. That raised a second question. When another site's agent wants the student's own schedule, who decides? We wanted the student to decide, and to keep proof.

## What it does

Campus Desk is a department website that answers questions for the student's own year and section.

- Ask in plain words: "Is my Wednesday class on?", "When is the tuition fee due, and what is the late fee?", "When is the Operating Systems exam?".
- A front desk agent hands off to a timetable agent, a notices agent, and a fees and exams agent. They call six site actions that run on the server and read the department data from a database.
- It reports cancelled and moved classes with the reason, fee amounts for the student's fee category with days left, and exam dates for their year.
- It can save a reminder. A card shows the exact action first. A guest session works at once, and an optional account keeps reminders across devices.
- It can ask a separate library site. A card names the site and says what it will never get: the model key, the saved class, the fee category, or the chat. Nothing is contacted until the student agrees.
- Outside agents ask first. The student gets a pairing code on the Activity page. An agent on another origin uses it to request access to chosen scopes. The student approves, picks a time limit, and the site signs a grant. Every call, and every refusal, is a signed receipt in a hash-chained tape. The student can verify the chain, check a single receipt on a public page, and end the access at once. A reminder an outside agent proposes stays pending until the student confirms it.
- The library site has a real study planner that works this way. It asks for exam dates only, then suggests a library day before each exam from the library's published hours.
- A "For agents" page shows the agent graph, the public files, and live checks that run in the visitor's browser with the published runtime.

The department is made up (Eastbrook Institute of Technology). Every page says the data is sample data.

## How we built it

- Next.js 16 (App Router) and React 19, Tailwind CSS 4, shadcn/ui on Radix, and Framer Motion. The look is our own: fonts, palette and components were set for a department office, not left at defaults.
- A server with a libSQL database. The same code runs on a local SQLite file and on hosted Turso. Tables hold the department data, students, sessions, reminders, access requests, grants and the ledger.
- The agent network is plain JSON in the Neuro SAN format: four agents, with instructions, schemas and a `FACT:` snapshot of the data in each specialist. It has no coded tools. The manifest lists the network, the default router, the allowed peers, the action bindings and the extension endpoints.
- Our own browser runtime does the agent work: validation, the agent loop, limits, action dispatch with schema checks, confirmation, peer loading with consent and policy, private context filtering, a streaming client for a visitor-key router, a small MCP client and WebMCP registration for read actions. The page loads the published runtime file.
- The student's private fields live in their own record. They are never a tool argument. Receipts list field names, never values.
- Grants are Ed25519-signed tokens, backed by a database row so they can be revoked. The ledger chains each entry to the one before and signs the hash. Verification runs in the browser with WebCrypto.
- Demo mode is a small rule-based model that the real runtime drives. It is labelled as not a language model on the page.
- Quality: a style check (no em dashes, no banned words), strict type checking, 181 unit and interop tests on a real database file, 53 checks in a real Chrome (including a fake router that records every request, the whole hand-off from a second origin, MCP, and axe-core on ten pages in two themes), and a conformance checker.

## How the project meets the main technology requirement

The submission asks for a conforming open agentic website: a public site, a `.json` agent network file, a `runtime` file, a user and agent interface, an optional model and key configuration, and a network that can interact with the site and with other sites.

- **Public files:** `agent-manifest.json` (network name, front agent, location, router metadata, peer policy, action bindings, runtime file), `campus_desk.network.json`, `links.json`, `runtime/agentic-runtime.js`.
- **Data only:** no coded tools in the network. Validated by our runtime, by `agentic-check`, and (when last run) by the reference validator.
- **Runtime:** parses and validates, runs the agent loop, uses registered site actions, loads a named peer after approval, bounds execution, fails closed.
- **Inference:** a published default (in-browser demo model) and an optional visitor key. The key stays in the browser and goes only to the chosen router. It never reaches a peer, a manifest, a prompt, an action result or the activity list.
- **Interaction:** the Ask page, six site actions, the library site that runs here after consent, and outside agents that call the live tools with a grant.
- **Extension, labelled as one:** grants, receipts, REST and MCP tool endpoints. The minimum profile does not cover site-to-site action calls, so the manifest says `deployment.mode: "server"` and lists these under `actions.remote`.

## Bonus prizes

The page lists no bonus categories beyond the ranked prizes and the Employee prize (for Cognizant employees only, so not relevant unless you work there). Potential Impact asks about shared tools, which is why `agentic-check` and the protocol are described in the form.

## Challenges we ran into

- Private context through a hand-off. The student's class had to reach the actions that need it and no other agent or site. It moved into the server record, so it is never an argument. A test records what a peer receives, and another checks the ledger for private values.
- Keeping receipts safe to share. The student id is replaced by a short hash, entries hold field names only, and the signed hash covers the whole payload.
- Making routing explainable without a model. The demo model splits a question into clauses and picks specialists, so a library question does not also trigger fees.
- Parallel first requests. A new visitor's page makes several calls at once, and each made its own guest. The first visit now gets a session token from the proxy, and the guest is made from that token, so parallel calls agree. A test covers it.
- Accessibility with dialogs, live regions and colour tints. Our tests caught low contrast on status tags, a duplicated chat panel with repeated ids, and tabs that fell under the contrast line. All fixed.

## Accomplishments that we're proud of

- All seven interoperability checks from the spec are tests against the real published files.
- A real hand-off between two origins that a judge can run in a minute: ask, approve, read, verify, end.
- Receipts that anyone can verify with a public key, and that break if one line is edited.
- No accessibility violations on any page, in light or dark.
- A conformance tool anyone can run on a folder or a URL.

## What we learned

- A short, honest tape of what happened does more to build trust than any claim in the instructions.
- Putting action bindings in the manifest keeps the network portable.
- Asking before contact is easy to build and hard to make clear. Naming what the other side will never get did the most.
- A student needs control and proof, not a settings page.

## What's next

- Run the Gemini and Otari paths against the live services and publish the results.
- Try the MCP endpoint with real clients.
- A small generator that turns a department's spreadsheet into the seed files.
- Streaming MCP replies and a shared rate limit across instances.

## Built with

TypeScript, Next.js, React, Tailwind CSS, shadcn/ui, Radix, Framer Motion, SQLite and Turso (libSQL), Node crypto (Ed25519, scrypt), WebCrypto, esbuild, vitest, puppeteer-core, axe-core, Google Gemini (OpenAI-compatible endpoint, visitor key), the Open Agentic Web minimum specification, the Neuro SAN network format, Model Context Protocol (server and client), WebMCP registration.

---

## Other form fields

| Field | Value |
|---|---|
| Public URL of the site | [your hosted URL, e.g. https://campus-desk.vercel.app/] |
| Second site used in the demo | [your hosted library URL, e.g. https://campus-desk-library.pages.dev/] |
| Video (YouTube, public, under 2:00) | [YouTube link] |
| Screenshots to upload | `docs/screenshots/13-activity-receipts.png`, `11-access-request.png`, `12-library-study-planner.png`, `05-confirm-write.png`, `06-consent-other-site.png`, `07-ask-with-activity.png`, `09-for-agents.png`, `01-home.png`, `10-phone-home.png`. Retake from the live URL if you can. |
| Source repository | [https://github.com/varshith-dev/campus-desk, once pushed] |
| Licence | Apache 2.0 (in `LICENSE`) |
| Extra shared tool (optional) | `agentic-check`: a command that tests a site's published files against the Open Agentic Web spec (`npx tsx tools/agentic-check.ts <folder-or-url>`). `docs/protocol.md`: the grant and receipt extension, written so another site can copy it. `tools/visiting-agent.ts`: a terminal agent that does the handshake. All in the repo. |
| Otari account email and note | Only if you use Otari. See below. |

### Testing instructions for judges (paste into the form)

1. Open [site URL]/ask. No account or key is needed. The sample clock is fixed at Mon 16 Nov 2026, 10:20, so answers are the same each time.
2. Ask "Is my Wednesday class on?". The answer says the class is cancelled and why. The "What ran" panel shows the agents and the server call.
3. Ask "Remind me to pay the tuition fee on 27 Nov". A confirm card shows the exact action. Confirm, and the reminder appears.
4. Ask "Is the library open late during exams?". A card asks before the library site runs here. Choose "Allow once".
5. Open [site URL]/activity and copy the pairing code. Open [library URL]/study-planner.html, paste the code and press Ask for access. Back on Campus Desk, approve the request. The planner shows library days before your exams. The tape lists each step as a signed receipt. Press "Verify the whole chain", then "End access".
6. Open [site URL]/verify and paste a receipt from the tape, then change one character and verify again.
7. Open [site URL]/agents to see the agent graph and the live checks.
8. Optional: sign in with ananya@eastbrook.example and chalk-and-brick-2026 (a sample student).
9. Optional: open AI settings, pick Gemini, and paste your own key. It stays in your browser.
10. Optional: `git clone`, `npm install`, `npm run build`, `npm run e2e`, `npm run check`.

### Note on what the demo is (paste into the form if there is room)

The default model is a small rule-based program, not a language model. It drives the real runtime. The own-key path is the one that answers open-ended questions. The department is made up. Grants and receipts are our own extension to the minimum profile.

---

## Otari (only if you use it)

The rules ask for an Otari account email and a short note on one problem and one suggested improvement, but only if the project uses Otari. Campus Desk lists an Otari preset in AI settings (`https://api.otari.ai/api/v1`, model `alibaba/qwen3.8-flash`, taken from the reference repo) but has never been run against it, so nothing here claims Otari use.

If you want to enter it: create an Otari account, paste its key in AI settings with the Otari preset, ask the five demo questions, and write the note from what actually happened. Do not use a note written before you have tried it.

---

## Steps that need your accounts

Nothing below was done. Each one needs a login, a payment, a public post or a submit.

1. **Check eligibility.** Confirm you meet the age rule for your country, and read /rules once more.
2. **Register for the hackathon on Devpost.** Join at https://cognizant-agenticweb.devpost.com/ with your Devpost account. Save a draft early.
3. **Create the accounts you need.** Turso (free) for the database, Vercel (free Hobby) or Firebase for Campus Desk, and a static host for the library site (Cloudflare Pages, Netlify or GitHub Pages).
4. **Deploy.** Follow `docs/deploy.md`: database, signing key, library site, then Campus Desk with `PEER_LIBRARY_URL`, `NEXT_PUBLIC_PEER_URL`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN` and `SIGNING_KEY_PEM`.
5. **Check the live pair.** `npx tsx tools/agentic-check.ts https://<your-site>/` should pass 14 of 14. Run the testing instructions above on the live URLs. Fix anything that differs from localhost. This is the one thing not tested: two real HTTPS sites calling each other.
6. **Try your own key once.** Paste a Gemini key in AI settings and ask a question. If the browser blocks the call, note the message. This path is tested only against a fake router.
7. **Retake screenshots** from the live URL if you can (`npm run screenshots` takes them from localhost).
8. **GitHub (public repo).** Create `campus-desk` under @varshith-dev and push this repo (`git remote add origin <url>`, then `git push -u origin main`). Commits are authored as "Campus Desk Dev". Change `user.name` and `user.email` first if you want your own name on later commits.
9. **Record the video.** Follow `demo-script.md`. You speak, the video is not AI generated, no music, under 2:00. Upload to YouTube as public.
10. **Fill the Devpost form** from this file. Replace every bracket. Add the video link, URL, repo and screenshots.
11. **Otari (optional).** See the Otari section.
12. **Submit** before Mon Jan 11, 2027, 9:30 PM IST (8:00 AM PST). Do it a few days early: the site has to stay free and working through judging (Jan 11 to 18). Keep the Turso database and the hosting projects alive until judging ends.
