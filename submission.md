# Devpost submission: Campus Desk

Hackathon: Open Agentic Web Challenge (https://cognizant-agenticweb.devpost.com/)
Deadline: Mon Jan 11, 2027, 8:00 AM PST, which is Mon Jan 11, 2027, 9:30 PM IST.
Entry type: new project, built inside the Submission Period (Nov 11, 2026 to Jan 11, 2027). No existing code is reused.
Nothing has been registered, signed in, pushed, deployed or submitted. This folder is build and package only.

Text in [square brackets] is something only the person submitting can fill in. Do not submit with any bracket left in.

---

## Project name

Campus Desk

## Tagline (one line)

A college department website that other agents can use: students ask in plain words, and any approved site can run the same agents.

---

## What the rules ask for, and where we stand

Taken from the hackathon page, /rules, resources and FAQ, and the Open Agentic Web minimum specification (MVP Profile 0.2, 6 Nov 2026), read on Nov 15, 2026.

| Requirement | Status |
|---|---|
| Stage 1 pass/fail: a conforming open agentic website | Built. `npm run check` (our checker) passes 14 of 14 on `dist/`. Both published networks were also run through the reference validator from the open source nsdeploy repo with no errors. Needs a re-check on the live URL. |
| Public URL of the site | Needs your account (hosting). See the steps at the end. |
| A conforming `.json` agent network file | Done: `campus_desk.network.json`, listed in `agent-manifest.json`. |
| A `runtime` file | Done: `runtime/agentic-runtime.js`, named in the manifest under `runtime.file`. |
| A user and agent interface | Done: the Ask page, with an activity list. |
| An optional LLM and key configuration UI | Done: AI settings (Gemini, Otari, OpenAI-compatible, custom), and a no-key demo mode. |
| The network can interact with the site and/or other agentic sites | Done: six site actions on this origin, and a second site (the library) that runs here after consent. |
| Text description | Below. |
| YouTube video under 2 minutes, public, shows a browser, entrant explains it, not AI generated, no trademarks or copyrighted music | Script is ready (`demo-script.md`). Needs recording and upload. |
| One or more screenshots | Ten in `docs/screenshots/`. |
| Open source, new or significantly updated, English, free to test until judging ends | Apache 2.0 licence is in the repo. Needs a public repo (your account). The site is free to use, and demo mode needs no key. |
| If Otari is used: account email and a short note on a problem and a suggested improvement | Not claimed. The Otari preset is in the settings but has not been run live. Use it and fill the note only if you really try it. See the Otari section. |
| Optional: extra shared tools or services for the community | `agentic-check`, in `tools/`. Described below. |
| Age of majority in your country of residence, not in a sanctioned place | You to confirm on the form. |

---

## Criteria-to-feature table

Stage 2 has four criteria, equally weighted at 25 percent each. Ties are broken in the order listed. Potential Impact explicitly rewards tools and services shared with the community.

| Criterion (25% each) | What the judges look for | Feature that answers it | Demo beat (see demo-script.md) | Where to check |
|---|---|---|---|---|
| Technological Implementation | A working, non-trivial site that really follows the spec | Own browser runtime (the project is about 3,900 lines of TypeScript in all) that validates before any model call, runs a bounded agent loop, checks action arguments, owns the confirm card, loads a named peer only after consent, filters private context, streams from a visitor-key router, and stops invalid networks, cycles, over-budget calls and denied origins with visible errors. 232 unit and interop tests (all seven spec checks), 47 browser checks, 14-check conformance tool | Core moment from 0:35 to 1:35, and the "agents page" shot | `src/runtime/`, `tests/interop.test.ts`, `npm run e2e`, `npm run check` |
| Design | A complete, coherent, usable experience | Four pages students use daily, plus a chat that shows its own work. Every state is designed: no key, own key, cancelled class, no match, a declined write, a denied site, an unreachable router. Light and dark, phone width, keyboard first, reduced motion. axe-core finds no violations on any page, in either theme, or with a dialog open | Opening shots, the confirm and consent cards | `docs/screenshots/`, `npm run e2e` (axe-core steps) |
| Potential Impact | A credible case for a real audience, with shared tools | Every college department has the same four questions and a website that only a person can read. A department publishes a folder of static files, with no server, and keeps student data in the browser. `agentic-check` lets anyone test any site against the spec. The runtime and tests are open source and can be reused | The closing 15 seconds, slide 6 | `tools/agentic-check.ts`, `README.md` ("Publish your own department") |
| Quality of the Idea | Creative, and different from what exists | The website itself is the agent: the department publishes agents as data and the visitor's browser runs them. A student's saved class is private context that never leaves, even when another site's agents run in the same page. The page shows each agent call and each private-context decision as it happens | The activity list during the core moment | "What happened" list on the Ask page |

---

## Inspiration

Ananya is in Year 2. Her timetable is a PDF, her fee dates are on a notice board, and last-minute changes arrive in group chats. A department website has all of it, but only a person scrolling can use it. The Open Agentic Web idea is that a site publishes agents as plain data and any browser can run them. A college department is a good test: small, public, and full of questions with exact answers.

## What it does

Campus Desk is a department website that answers questions for the student's own year and section.

- Ask in plain words: "Is my Wednesday class on?", "When is the tuition fee due, and what is the late fee?", "When is the Operating Systems exam?".
- A front desk agent hands off to a timetable agent, a notices agent, and a fees and exams agent. They call six site actions that read the department data.
- It reports cancelled and moved classes with the reason, fee amounts for the student's fee category with days left, and exam dates for their year.
- It can save a reminder. A card shows the exact action first. Reminders stay in the browser and can be downloaded as a calendar file.
- It can ask a separate library site. A card names the site and says what it will never get: the model key, the saved class, the fee category, or the chat. Nothing is contacted until the student agrees.
- A "For agents" page shows the agent graph, the public files, and live checks that run in the visitor's browser.
- Other agentic sites add one URL to their own network and run Campus Desk in their own browser. Because the site is static, they get a dated snapshot of the data.

The department is made up (Eastbrook Institute of Technology). Every page says the data is sample data.

## How we built it

- A static site, written in TypeScript, with no framework. Pages are built to plain HTML and one script.
- The agent network is plain JSON in the Neuro SAN format: four agents, with instructions, schemas and a `FACT:` snapshot of the data in each specialist. It has no coded tools.
- The manifest lists the network, the default router, the allowed peers and the site action bindings. Actions are bound to agents in the manifest, so the network file stays plain agent data.
- Our own browser runtime does the work: validation, the agent loop, limits, action dispatch with schema checks, confirmation, peer loading with consent and policy, private context filtering, a streaming client for a visitor-key router, a small MCP client and WebMCP registration for read actions.
- Demo mode is a small rule-based model that the real runtime drives. It is labelled as not a language model on the page.
- Quality: a style check (no em dashes, no banned words), strict type checking, 232 unit and interop tests, 47 checks in a real Chrome (including a fake router that records every request, and axe-core on every page), and a conformance checker.

## How the project meets the main technology requirement

The submission asks for a conforming open agentic website: a public site, a `.json` agent network file, a `runtime` file, a user and agent interface, an optional model and key configuration, and a network that can interact with the site and with other sites.

- **Public files:** `agent-manifest.json` (network name, front agent, location, router metadata, peer policy, action bindings, runtime file), `campus_desk.network.json`, `links.json`, `runtime/agentic-runtime.js`.
- **Data only:** no coded tools in the network. Validated by our runtime, by `agentic-check`, and by the reference validator.
- **Runtime:** parses and validates, runs the agent loop, uses registered site actions, loads a named peer after approval, bounds execution, fails closed.
- **Inference:** a published default (in-browser demo model) and an optional visitor key. The key stays in the browser and goes only to the chosen router. It never reaches a peer, a manifest, a prompt, an action result or the activity list.
- **Interaction:** the Ask page, six site actions on this origin, and the library site that runs here after consent.

## Bonus prizes

The page lists no bonus categories beyond the ranked prizes and the Employee prize (for Cognizant employees only, so not relevant unless you work there). Potential Impact asks about shared tools, which is why `agentic-check` is described in the form.

## Challenges we ran into

- Keeping a static site honest. A caller's browser can run the network but not our site actions, so we publish a dated snapshot in the specialists and say so.
- Private context through a hand-off. The student's class had to reach the actions that need it and no other agent or site. The front agent names no field, and a test records what a peer receives.
- Making routing explainable without a model. The demo model splits a question into clauses and picks specialists, so a library question does not also trigger fees.
- Accessibility with dialogs and live regions. Our tests found a notice banner outside any landmark and two skipped heading levels, which we fixed.
- A browser detail: reading a response header without reading the body kept a page "loading" forever. The live check now reads the file.

## Accomplishments that we're proud of

- All seven interoperability checks from the spec are tests against the real published files.
- A confirm card that shows the exact action, and a consent card that says what the other site will not get.
- No accessibility violations on any page, in light or dark, or with a dialog open.
- A conformance tool anyone can run on a folder or a URL.

## What we learned

- A short, honest "what happened" list does more to build trust than any claim in the instructions.
- Putting action bindings in the manifest keeps the network portable.
- Asking before contact is easy to build and hard to make clear. Naming what the other site will never get did the most.

## What's next

- Call site actions across sites with an origin-checked message channel, so a caller gets live data and not a snapshot.
- Run the Gemini and Otari paths against the live services and publish the results.
- A small generator that turns a department's spreadsheet into the data files.
- More departments and a shared directory.

## Built with

TypeScript, esbuild, vitest, jsdom, puppeteer-core, axe-core, Google Gemini (OpenAI-compatible endpoint, visitor key), the Open Agentic Web minimum specification, the Neuro SAN network format, Model Context Protocol (client, tested on stubs), WebMCP registration.

---

## Other form fields

| Field | Value |
|---|---|
| Public URL of the site | [your hosted URL, e.g. https://campus-desk.pages.dev/] |
| Second site used in the demo | [your hosted peer URL, e.g. https://campus-desk-library.pages.dev/] |
| Video (YouTube, public, under 2:00) | [YouTube link] |
| Screenshots to upload | `docs/screenshots/05-confirm-write.png`, `06-consent-other-site.png`, `07-ask-with-activity.png`, `09-for-agents.png`, `01-home.png`. Retake from the live URL if you can. |
| Source repository | [https://github.com/varshith-dev/campus-desk, once pushed] |
| Licence | Apache 2.0 (in `LICENSE`) |
| Extra shared tool (optional) | `agentic-check`: a command that tests a site's published files against the Open Agentic Web spec. `npx tsx tools/agentic-check.ts <folder-or-url>`. In the repo under `tools/`. |
| Otari account email and note | Only if you use Otari. See below. |

### Testing instructions for judges (paste into the form)

1. Open [site URL]/ask.html. No account or key is needed. The sample clock is fixed at Mon 16 Nov 2026, 10:20, so answers are the same each time.
2. Ask "Is my Wednesday class on?". The answer says the class is cancelled and why. Open "What happened" to see the agent and the site action that ran.
3. Ask "Remind me to pay the tuition fee on 27 Nov". A confirm card shows the exact action. Confirm, and the reminder appears in the list.
4. Ask "Is the library open late during exams?". A card asks before the library site runs here. Choose "Allow once". The answer comes from the library's published facts, and the activity list shows which private fields were kept back.
5. Open [site URL]/agents.html to see the agent graph and the live checks.
6. Optional: open AI settings, pick Gemini, and paste your own key. It stays in your browser.
7. Optional: `git clone`, `npm install`, `npm run build`, `npm run check`.

### Note on what the demo is (paste into the form if there is room)

The default model is a small rule-based program, not a language model. It drives the real runtime. The own-key path is the one that answers open-ended questions. The department is made up. Another site gets a dated snapshot of the data, not live site actions.

---

## Otari (only if you use it)

The rules ask for an Otari account email and a short note on one problem and one suggested improvement, but only if the project uses Otari. Campus Desk lists an Otari preset in AI settings (`https://api.otari.ai/api/v1`, model `alibaba/qwen3.8-flash`, taken from the reference repo) but has never been run against it, so nothing here claims Otari use.

If you want to enter it: create an Otari account, paste its key in AI settings with the Otari preset, ask the five demo questions, and write the note from what actually happened. Do not use a note written before you have tried it.

---

## Steps that need your accounts

Nothing below was done. Each one needs a login, a payment, a public post or a submit.

1. **Check eligibility.** Confirm you meet the age rule for your country, and read /rules once more.
2. **Register for the hackathon on Devpost.** Join at https://cognizant-agenticweb.devpost.com/ with your Devpost account. Save a draft early.
3. **Choose hosting for two sites.** Any static host works (Cloudflare Pages, Netlify, GitHub Pages). You need two places: one for `dist/` and one for `dist-peer/`. Use HTTPS. The host must send `Access-Control-Allow-Origin: *` for public files. `dist/_headers` does this on Netlify and Cloudflare Pages. GitHub Pages already allows it.
4. **Deploy the library site first.** Upload `dist-peer/`. Note its URL, for example `https://campus-desk-library.pages.dev`.
5. **Rebuild the main site with that URL.** `PEER_LIBRARY_URL=https://campus-desk-library.pages.dev/library_desk npm run build:site`. Upload `dist/`. If you want to skip the second site, run `npx tsx scripts/build.ts --no-peer` and drop the library from the demo.
6. **Check the live site.** `npx tsx tools/agentic-check.ts https://<your-site>/` should pass. Open the Ask page, run the five demo questions, and open the For agents page. Fix anything that differs from localhost. This is the one thing not tested: two real HTTPS sites calling each other.
7. **Try your own key once.** Paste a Gemini key in AI settings and ask a question. If the browser blocks the call, note the message. This path is tested only against a fake router.
8. **Retake screenshots** from the live URL if you can (`npm run screenshots` takes them from localhost).
9. **GitHub (public repo).** Create `campus-desk` under @varshith-dev and push this repo (`git remote add origin <url>`, then `git push -u origin main`). Commits are authored as "Campus Desk Dev". Change `user.name` and `user.email` first if you want your own name on later commits.
10. **Record the video.** Follow `demo-script.md`. You speak, the video is not AI generated, no music, under 2:00. Upload to YouTube as public.
11. **Fill the Devpost form** from this file. Replace every bracket. Add the video link, URL, repo and screenshots.
12. **Otari (optional).** See the Otari section.
13. **Submit** before Mon Jan 11, 2027, 9:30 PM IST (8:00 AM PST). Do it a few days early: the site has to stay free and working through judging (Jan 11 to 18).
