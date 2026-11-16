# Demo video script and slide outline: Campus Desk

Target length: 1:50. The rules say the video must be **under 2:00**, so aim to finish between 1:45 and 1:55 and never go over.
Rules for the video: public on YouTube, shows a browser, **you** explain it in your own voice, not AI generated, no music, no trademarks or copyrighted material. Show only this site, a terminal and the slides. Do not show a real key or any private tab.

## Before you record

1. Decide what you film. Best: the live site, after the live checks in `docs/deploy.md` pass. Fallback: localhost (`npm run build:site`, `npm run build:peer`, then `npm start` and `npm run serve:peer` in two terminals). If you film localhost, say "this is running on my machine" once.
2. Open two windows in a fresh private profile, side by side or on two desktops:
   - A: Campus Desk, `/ask`.
   - B: the library site, `/study-planner.html`.
   A fresh profile has no stored key, no saved reminders and no old grants. The sample clock is fixed (Mon 16 Nov 2026, 10:20), so the answers below are exact.
3. Browser at 1280 by 720, zoom 110 percent, notifications off, no bookmarks bar, no personal tabs.
4. Have a terminal ready in the project folder, font large, with `npm run check` typed but not run.
5. Open `docs/deck/campus-desk-deck.pdf` full screen for slides 1 and 7.
6. Say it in your own voice. Short sentences. The lines below are a guide. Reword so it sounds like you, and keep each part within its time.
7. Rehearse twice with a timer. Each part is written for about 2.5 spoken words per second.

## Timed script

| Time | On screen | Say (guide) |
|---|---|---|
| 0:00 to 0:10 | Slide 1 | "This is Campus Desk, a department website that students can ask, and that other agents can use, but only if the student says yes. The department is made up." |
| 0:10 to 0:18 | Window A, home page | "Ananya's timetable, fee dates and notices live in a PDF and a notice board. Here they are in one place, for her class." |
| **0:18 to 1:25** | **Core moment, see below** | |
| 1:25 to 1:40 | Agents page, then the terminal: run `npm run check` | "The department publishes a manifest, a network file and a runtime. Any site can read them. This page checks them live, and this command checks any site's files against the spec." |
| 1:40 to 1:55 | Slide 7 | "There are tests for the database, the signed receipts and every page. It is open source, so any department can publish its own. Campus Desk." |

## The core moment (0:18 to 1:25)

One take. Everything you say must already be on screen.

| Time | Action | Say (guide) |
|---|---|---|
| 0:18 | Window A, Ask page. Type "Is my Wednesday class on?" and send. | "I ask if my Wednesday class is on." |
| 0:24 | The answer shows the class cancelled with the reason. Point to the "What ran" panel. | "It is cancelled, and it says why. On the right I see what ran: the front desk, the timetable agent, and a call to the server." |
| 0:34 | Type "Remind me to pay the tuition fee on 27 Nov". The confirm card opens. Point to the action and details, click Confirm and save. | "A write needs me. The card shows the exact action. I confirm, and it is saved." |
| 0:46 | Click Agent activity in the menu. Point to the pairing code. | "Now the part I care about most. Other agents have to ask me first. This is my pairing code." |
| 0:52 | Switch to window B, the library study planner. Paste the code and click Ask for access. Switch back to A. The request card is on screen. | "The library site has a study planner. It asks for my exam dates only. Nothing is shared yet." |
| 1:02 | Leave the exam scope ticked and pick one hour. Click Approve. Switch to B: the suggested library days appear. | "I approve it for one hour. It reads my exam dates and suggests when to study at the library." |
| 1:12 | Back to A. Point to the tape: asked, approved, called get_exam_dates. Click Verify the whole chain. | "Every step is a signed receipt in a chain. I can verify the chain. If one line is edited, it breaks." |
| 1:19 | Click End access on the grant. | "And I can end the access with one click." |
| 1:25 | End of the core moment | |

If you are short of time, drop the confirm card (0:34 to 0:46) and keep the access flow. The access flow is the part that is new.

## Recording notes

- Do not talk over a spinner. In demo mode answers are instant. With a real key, wait.
- Pause a second on each card so it can be read.
- If the sample clock or an answer differs from this script, say what is on screen. Do not read the script over a different answer.
- Do not mention any feature you did not run. Do not say Gemini or Otari was used unless you recorded it with a real key (and keep the key off screen). Say "demo mode" when it is demo mode.
- Say once that the default demo model is a small rule-based program, not a language model, if you use demo mode in the video. A short way: "This demo model is rule based, not a language model."
- Show only sample data. Do not show other tabs, accounts or tokens.
- Export at 1080p. Add captions if you can. No music.
- The consent card for the library's agents (slide 4) is not in the timed script. Mention it only if you have time, and only if you ran it.

## Slide outline (7 slides)

The slides are in `docs/deck/` (`deck.html`, `campus-desk-deck.pdf`, and `slide-1.png` to `slide-7.png`). Rebuild them with `npm run deck`.

| # | Title | Content | Criterion |
|---|---|---|---|
| 1 | Campus Desk | The pitch in one line, the home page. | Quality of the idea |
| 2 | The answers exist. Nobody can ask for them. | What students need, what the department needs. | Potential Impact |
| 3 | Published files, a browser runtime, and a small server | Manifest, network, runtime, server, and the agent graph. | Technological Implementation |
| 4 | Ask, see the agents work, approve the write | The confirm card and the consent card. | Design |
| 5 | Outside agents ask first. Every call is a signed receipt. | The request and the receipt tape. | Quality of the idea, Potential Impact |
| 6 | The seven checks in the spec, each one tested | A table from check to evidence. | Technological Implementation |
| 7 | Any department can adapt it | 181 tests, 53 browser checks, 14 conformance checks, Apache 2.0, honest limits. | Potential Impact |

The two-minute video uses slides 1 and 7. Slides 2 to 6 are for the Devpost gallery and a longer talk.

## Speaker notes for each slide (about 10 to 20 seconds each)

1. "Campus Desk is a department website that other agents can use too, and only with the student's yes. The data in this demo is made up."
2. "The answers exist, but a student has to dig through a PDF, a notice board and group chats. A department site is built for one reader at a time, so nothing else can use it safely."
3. "The department publishes files. The browser loads the manifest, checks the network, and runs four small agents. They call six actions on a small server with a database. Another site can run the same agents in its own browser."
4. "Before it saves a reminder, the page shows the exact action. Before it runs another site's agents, it names the site and says what that site never gets."
5. "An outside agent has to ask. I choose what it may read and for how long. Each read becomes a signed receipt, and I can end the access any time."
6. "These are the seven checks in the spec. Each one has a test against the real published files."
7. "There are 181 tests, 53 browser checks including accessibility on every page, and a command that checks any site. It is Apache 2.0. The limits are written down: demo mode is rule based, and it is not deployed until you do it."

## Claims you can make, and the proof

| You can say | Proof |
|---|---|
| "Each check in the spec is a test" | `tests/interop.test.ts` (13 tests) |
| "Receipts are signed and chained, and an edit breaks the chain" | `tests/server.test.ts` (signed ledger), e2e "a receipt copied from the tape verifies on the public page, and an edited one does not" |
| "An agent can only read what I approved, and I can end it" | e2e: the scoped grant, refused tool, revoke |
| "No accessibility violations" | `npm run e2e`, the axe-core steps |
| "The key only goes to the router" | `npm run e2e`, "a question goes to the chosen router with the key, and nowhere else" |
| "Anyone can check any site" | `npm run check`, `npm run check:live` and `tools/agentic-check.ts` |

## Claims you cannot make yet

- That it works on a live HTTPS site. It is not deployed.
- That Gemini or Otari answers well. Both are untested against the live services.
- That a real MCP client such as Claude or Cursor works with it. It is tested with the repo's own client.
- That WebMCP works in a browser that ships it.
