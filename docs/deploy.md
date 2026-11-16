# Deploying Campus Desk

Nothing here has been run for you. Campus Desk is two sites:

| Site | What it is | Where it can live |
|---|---|---|
| **Campus Desk** | A Next.js app with server routes and a database | Vercel (free Hobby plan) or Firebase App Hosting |
| **Library site** | Static files in `dist-peer/` (a sample peer and the study planner) | Any static host: Cloudflare Pages, Netlify, GitHub Pages, Vercel static |

Both need HTTPS. Campus Desk sends `Access-Control-Allow-Origin: *` on its public files and on the agent endpoints. `dist-peer/_headers` does the same on Netlify and Cloudflare Pages. GitHub Pages already allows cross-origin reads.

## 1. A database

Local work uses a SQLite file. A hosted copy should use a free [Turso](https://turso.tech) database. It is the same SQL and the same driver (`@libsql/client`).

```bash
turso db create campus-desk
turso db show campus-desk --url          # DATABASE_URL, starts with libsql://
turso db tokens create campus-desk       # DATABASE_AUTH_TOKEN
```

The app creates its tables and loads `data/seed/*.json` on first start. Without Turso, Vercel falls back to a file in `/tmp`, which is wiped on a cold start. That is fine for a quick look and wrong for judging.

## 2. A signing key

Grants and receipts are signed with Ed25519. If `SIGNING_KEY_PEM` is empty, the app makes a key and stores it in the database. Set your own so receipts stay valid if the database is ever reset:

```bash
openssl genpkey -algorithm ed25519      # paste the whole PEM, including the BEGIN and END lines
```

The public half is served at `/.well-known/campus-desk-keys.json`.

## 3. The library site first

```bash
CAMPUS_DESK_URL=https://<your-campus-desk-host> npm run build:peer
# upload dist-peer/ to a static host, note its URL, for example https://campus-desk-library.pages.dev
```

The study planner page in `dist-peer/` has a content security policy that allows connections to `CAMPUS_DESK_URL` only. If you do not know the Campus Desk URL yet, deploy Campus Desk first with the default peer URL, then build and upload the library site, then redeploy Campus Desk.

## 4. Campus Desk on Vercel

1. Push the repo to GitHub (your account) and import it in Vercel. Framework: Next.js. `vercel.json` sets the build command to `npm run build:site`.
2. Environment variables (Project, Settings, Environment Variables), for Production:

| Name | Value |
|---|---|
| `DATABASE_URL` | the `libsql://` URL |
| `DATABASE_AUTH_TOKEN` | the Turso token |
| `SIGNING_KEY_PEM` | the PEM |
| `PEER_LIBRARY_URL` | `https://<library-host>/library_desk` (read at build time) |
| `NEXT_PUBLIC_PEER_URL` | `https://<library-host>` |
| `SEED_DEMO_ACCOUNT` | `1` |

3. Deploy. `npm run build:site` rewrites the manifest and network with your peer URL before `next build`.
4. The live event tape uses server-sent events that end after about 25 seconds and reconnect on their own, so they work inside Vercel's function time limit.

## 4b. Campus Desk on Firebase App Hosting

`apphosting.yaml` is ready. Replace the placeholder peer URL, create the three secrets with `firebase apphosting:secrets:set`, then `firebase apphosting:backends:create` and roll out from your GitHub repo. App Hosting needs the Blaze plan (it has a free allowance).

## 5. Check the live pair

```bash
npx tsx tools/agentic-check.ts https://<your-campus-desk-host>/      # 14 checks
curl -s https://<your-campus-desk-host>/api/health
```

Then by hand:

1. Open `/ask`, run the five demo questions, allow the library once.
2. Open `/activity`, copy the code, open the library `study-planner.html`, paste it, approve on Campus Desk.
3. Open `/agents`: every live check should be green.
4. Run `npx tsx tools/visiting-agent.ts <code> --base https://<host> --origin https://example.org` from a terminal.

The only paths not tested before you do this are two real HTTPS sites calling each other and your own Gemini or Otari key.

## What costs money

Nothing in this setup needs a paid plan: Vercel Hobby, Turso free tier, and a static host are free. Do not turn on a plan that bills by usage without a limit.

## Not done for you

Creating accounts, pushing to GitHub, deploying, setting secrets, and submitting on Devpost all need your login or approval.
