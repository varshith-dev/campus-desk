# Agent access and receipts (a Campus Desk extension)

The Open Agentic Web minimum profile lets a caller run a site's network in its own browser. It does not say how a caller can use a site's **live** tools for a particular person. Campus Desk adds a small, optional way to do that. It is written down here so another site can copy it. Nothing in the minimum profile depends on it, and the manifest labels it as an extension (`deployment.mode: "server"`, `actions.remote`).

## The flow

```
student                    Campus Desk                       outside agent (its own origin)
   | open /activity            |                                      |
   |-------------------------->| pairing code EB-XXXXXX               |
   | read the code out         |                                      |
   |---------------------------------------------------------------->|
   |                           |<-- POST /api/agent/requests ---------|  code, name, origin, scopes, reason
   |                           |--- 202 request_id, poll_secret ----->|
   | sees the request          |                                      |
   | picks scopes and a time   |                                      |
   |-- POST decide ----------->| signs a grant token (Ed25519)        |
   |                           |<-- GET /api/agent/requests/:id ------|  Bearer poll_secret
   |                           |--- token, handed over once --------->|
   |                           |<-- POST /api/agent/tools/:name ------|  Bearer token
   |                           |--- result + signed receipt --------->|
```

## Scopes

| Scope | Allows | Tools |
|---|---|---|
| `timetable:read` | the class timetable, including cancelled and moved classes | `get_timetable`, `get_next_class` |
| `notices:read` | notices for the student's year | `search_notices` |
| `fees:read` | fee dates and amounts for the student's fee category | `get_fee_dates` |
| `exams:read` | exam dates, times and venues | `get_exam_dates` |
| `reminders:propose` | propose a reminder. It stays pending until the student confirms it on the Reminders page | `save_reminder` |

The student can approve fewer scopes than the agent asked for, never more. Time limits are 15 minutes, 1 hour, 24 hours or 7 days.

## The token

`cdg1.<payload>.<signature>`. The payload is canonical JSON: grant id `gid`, audience origin `aud`, scopes `scp`, issued and expiry times, and the key id. The signature is Ed25519 over `cdg1.<payload>`. The server also keeps the grant in its database, so a token can be revoked before it expires. A token is handed to the agent once. The server then deletes its copy.

Every call checks, in order: the signature, that the grant exists, revoked, expired, the browser `Origin` header against the grant's origin (when the caller is a browser), and the scope. A refusal is written to the ledger.

The student's year, section and fee category are never part of a request, a token or a receipt. A tool reads them from the student's record on the server.

## Receipts

Each student has a chain of entries. An entry is a canonical JSON payload (what happened, who, which tool, which scope, which **field names** were read, never values) plus:

```
hash = sha256(prev_hash + canonical(payload))      first prev_hash is 64 zeros
sig  = Ed25519(hash)                               key published at /.well-known/campus-desk-keys.json
```

The student id in a payload is a 12 character pseudonym (`sha256("student:" + id)`), so a receipt can be shared. Editing, removing or reordering an entry breaks the chain. `GET /api/ledger/verify` walks it. `POST /api/receipts/verify` and the `/verify` page check one receipt on its own, using only the payload, the previous hash and the public key.

## Endpoints

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/agent/requests` | none (rate limited) | ask for access |
| `GET /api/agent/requests/:id` | `Bearer <poll_secret>` | collect the decision and the token, once |
| `GET /api/agent/tools` | none | tool and scope discovery |
| `POST /api/agent/tools/:name` | `Bearer <token>` | call a tool, body `{ "args": { ... } }` |
| `POST /api/mcp` | `Bearer <token>` | the same tools over MCP: `initialize`, `tools/list`, `tools/call`, `ping` (JSON replies, no streaming) |
| `GET /.well-known/campus-desk-keys.json` | none | public key as a JWK |
| `POST /api/receipts/verify` | none | check one receipt |

The agent endpoints send `Access-Control-Allow-Origin: *` because the bearer token, not a cookie, is the credential. Student-facing endpoints use a same-site cookie and send no CORS headers.

## What this does not do

- It does not stop an agent that holds a valid token from using the data it was given. It limits what, for how long, and leaves proof.
- A non-browser caller can leave out the `Origin` header, so the origin binding protects browser callers only. Scope, expiry and revocation apply to everyone.
- Rate limits are kept in memory, per server instance.
- The server signs with one key. Rotating it means old receipts need the old public key.
