# Demo video script and slide outline: Campus Desk

Target length: 1:50. The rules say the video must be **under 2:00**, so aim to finish between 1:45 and 1:55 and never go over.
Rules for the video: public on YouTube, shows a browser, **you** explain it in your own voice, not AI generated, no music, no trademarks or copyrighted material. Show only this site, a terminal and the slides. Do not show a real key or any private tab.

## Before you record

1. Decide what you film. Best: the live site, after the live checks in `submission.md` pass. Fallback: localhost (`npm run build`, then `npm run serve` and `npm run serve:peer` in two terminals). If you film localhost, say "this is running on my machine" once.
2. Open http://localhost:5173/ask.html (or the live URL) in a fresh private window so there is no stored key and no saved reminders. The sample clock is fixed (Mon 16 Nov 2026, 10:20), so the answers below are exact.
3. Browser at 1280 by 720, zoom 110 percent, notifications off, no bookmarks bar, no personal tabs.
4. Have a terminal ready in the project folder, with the font large, and `npm run check` typed but not run.
5. Open `docs/deck/campus-desk-deck.pdf` full screen for slides 1, 2, 5 and 6.
6. Say it in your own voice. Short sentences. The lines below are a guide. Reword so it sounds like you, and keep each part within its time.
7. Rehearse twice with a timer. Each part is written for about 2.5 spoken words per second.

## Timed script

| Time | On screen | Say (guide) |
|---|---|---|
| 0:00 to 0:10 | Slide 1, then slide 2 | "This is Campus Desk. A department website that students can ask, and that other sites can use. The department is made up." |
| 0:10 to 0:20 | Home page | "Ananya's timetable, fee dates and notices live in a PDF and a notice board. Here they are in one place, for her class." |
| **0:20 to 1:20** | **Core moment, see below** | |
| 1:20 to 1:35 | For agents page, then the terminal: run `npm run check` | "The department publishes a manifest, a network file and a runtime. Any site can read them. This page checks them live. And this command checks any site's files against the spec." |
| 1:35 to 1:45 | Ask page, open AI settings (Gemini selected, key field empty) | "No key is needed. For open-ended questions a student can add their own Gemini key. It stays in their browser and goes only to that router." Close the dialog. |
| 1:45 to 1:55 | Slide 5, then slide 6 | "Each check in the spec is a test. It is open source, so any department can publish its own. Campus Desk." |

## The 60-second core moment (0:20 to 1:20)

One take. This is the part the whole video exists for. Everything you say must already be on screen.

| Time | Action | Say (guide) |
|---|---|---|
| 0:20 | Ask page. Click the question box, type "Is my Wednesday class on?" and send. | "I ask if my Wednesday class is on." |
| 0:26 | The answer shows CS203 cancelled with the reason. Point to the "What happened" list: timetable agent, then the site action. | "It says the class is cancelled, and why. On the right I can see what ran: the front desk handed off to the timetable agent, which called a site action." |
| 0:40 | Type "When is the tuition fee due, and what is the late fee?" and send. Point to the amount and days left. | "Fees depend on my year and fee category. It uses what I saved, and that stays private." |
| 0:50 | Type "Remind me to pay the tuition fee on 27 Nov". The confirm card opens. Point to the action and the details, then click Confirm. | "A write needs me. The card shows the exact action. I confirm, and the reminder is saved in this browser." |
| 1:02 | Type "Is the library open late during exams?". The consent card opens. Point to the site and the "never gets" line, then click Allow once. | "Now a question for a different site, the library. The page asks first, names the site, and says it never gets my key, my class or this chat." |
| 1:12 | The answer shows the 22:00 hours. Point to the activity lines "Loaded library_desk" and "Kept from the other site". | "The library's agents ran right here, and the activity list says which private fields were kept back." |
| 1:20 | End of the core moment | |

## Recording notes

- Do not talk over a spinner. In demo mode answers are instant. With a real key, wait.
- Pause a second on each card so it can be read.
- If the sample clock or an answer differs from this script, say what is on screen. Do not read the script over a different answer.
- Do not mention any feature you did not run. In particular, do not say Gemini was used unless you recorded it with a real key (and keep the key off screen). Do not say Otari was used. Say "demo mode" when it is demo mode.
- Say once that the default demo model is a small rule-based program, not a language model, if you use demo mode in the video.
- Show only sample data. Do not show other tabs, accounts or tokens.
- Export at 1080p. Add captions if you can. No music.

## Slide outline (6 slides)

The slides are in `docs/deck/` (`deck.html`, `campus-desk-deck.pdf`, and `slide-1.png` to `slide-6.png`). Rebuild them with `npm run deck`.

| # | Title | Content | Criterion |
|---|---|---|---|
| 1 | Campus Desk | The pitch in one line, the home page. | Quality of the idea |
| 2 | The answers exist. Nobody can ask for them. | What students need, what the department needs. | Potential Impact |
| 3 | Publish files. The browser does the rest. | Manifest, network, runtime, site actions, and the agent graph. | Technological Implementation |
| 4 | The 60 second moment | The confirm card and the consent card. | Design |
| 5 | The seven checks in the spec, each one tested | A table from check to evidence. | Technological Implementation |
| 6 | Any department can adapt it | 232 tests, 47 browser checks, 14 conformance checks, Apache 2.0, honest limits. | Potential Impact |

Slides 3 and 4 are for the Devpost gallery and a longer talk. The two-minute video uses slides 1, 2, 5 and 6.

## Speaker notes for each slide (about 10 to 20 seconds each)

1. "Campus Desk is a department website that other agents can use too. Students ask in plain words. The data in this demo is made up."
2. "The answers exist, but a student has to dig through a PDF, a notice board and group chats. A department site is built for one reader at a time, so nothing else can call it."
3. "The department publishes files. The browser loads the manifest, checks the network, and runs four small agents. They call six site actions that read the data. One saves a reminder, after a confirm card. Another site adds one URL and runs the same agents in its own browser."
4. "Before it saves a reminder, the page shows the exact action. Before it runs another site's agents, it names the site and says what that site never gets."
5. "These are the seven checks in the spec. Each one has a test against the real published files. The key test records every request and checks where the key went."
6. "There are 232 tests, 47 browser checks including accessibility on every page, and a command that checks any site. It is Apache 2.0. The limits are written down: demo mode is not a language model, and another site gets a snapshot."

## Claims you can make, and the proof

| You can say | Proof |
|---|---|
| "Each check in the spec is a test" | `tests/interop.test.ts` (13 tests) |
| "No accessibility violations" | `npm run e2e`, the axe-core steps |
| "The key only goes to the router" | `npm run e2e`, "a question goes to the chosen router with the key, and nowhere else" |
| "Anyone can check any site" | `npm run check` and `tools/agentic-check.ts` |

## Claims you cannot make yet

- That it works on a live HTTPS site. It is not deployed.
- That Gemini or Otari answers well. Both are untested against the live services.
- That MCP or WebMCP work with real clients. Both are tested on stubs only.
