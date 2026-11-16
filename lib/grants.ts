// Agent access: how an outside agent site gets permission to call Campus Desk's live tools.
//
//   1. The student reads a pairing code (EB-XXXXXX) off their Activity page and gives it to the agent.
//   2. The agent posts an access request: its name, its origin, the scopes it wants and why.
//   3. The student sees the request on the Activity page and approves some or all scopes, or declines.
//   4. On approval the site signs a grant token (Ed25519). The agent collects it once, by polling.
//   5. Each tool call carries the token. The site checks the signature, expiry, revocation, scope and
//      the caller's Origin header, then writes a signed ledger entry whatever the outcome.
import type { Client } from '@libsql/client';
import { b64u, canonical, fromB64u, getSigner, randomId, sha256, signText, verifyText } from './crypto';
import { appendLedger } from './ledger';
import { ALL_SCOPES, SCOPES, type Scope } from './tools';
import { studentByPairingCode, studentById, type Student } from './store';

const TOKEN_PREFIX = 'cdg1';
export const TTL_CHOICES = { '15m': 900, '1h': 3600, '24h': 86400, '7d': 604800 } as const;
export type Ttl = keyof typeof TTL_CHOICES;
const TTL_WORDS: Record<Ttl, string> = { '15m': '15 minutes', '1h': '1 hour', '24h': '24 hours', '7d': '7 days' };

export class GrantError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface GrantRow {
  id: string;
  agentName: string;
  origin: string;
  scopes: Scope[];
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

const rowToGrant = (r: Record<string, unknown>): GrantRow => ({ id: String(r.id), agentName: String(r.agent_name), origin: String(r.origin), scopes: JSON.parse(String(r.scopes)), createdAt: String(r.created_at), expiresAt: String(r.expires_at), revokedAt: r.revoked_at ? String(r.revoked_at) : undefined });

export interface AccessRequestRow {
  id: string;
  agentName: string;
  origin: string;
  scopes: Scope[];
  reason: string;
  status: 'pending' | 'approved' | 'declined' | 'delivered';
  createdAt: string;
}

const rowToRequest = (r: Record<string, unknown>): AccessRequestRow => ({ id: String(r.id), agentName: String(r.agent_name), origin: String(r.origin), scopes: JSON.parse(String(r.scopes)), reason: String(r.reason), status: String(r.status) as AccessRequestRow['status'], createdAt: String(r.created_at) });

export function normaliseOrigin(raw: unknown): string {
  try {
    const u = new URL(String(raw));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
    return u.origin;
  } catch {
    throw new GrantError(400, 'bad_origin', 'origin must be a web origin such as https://library.example.');
  }
}

// ---- Step 2: an agent asks ----

export async function createAccessRequest(db: Client, input: { code: unknown; name: unknown; origin: unknown; scopes: unknown; reason: unknown }): Promise<{ id: string; pollSecret: string; student: Student }> {
  const name = String(input.name ?? '').trim();
  const reason = String(input.reason ?? '').trim();
  if (name.length < 2 || name.length > 60) throw new GrantError(400, 'bad_name', 'name must be 2 to 60 characters.');
  if (reason.length < 8 || reason.length > 240) throw new GrantError(400, 'bad_reason', 'reason must say in 8 to 240 characters why the agent wants access.');
  const origin = normaliseOrigin(input.origin);
  const scopes = Array.isArray(input.scopes) ? (input.scopes as unknown[]).map(String) : [];
  if (!scopes.length || scopes.some((s) => !ALL_SCOPES.includes(s as Scope))) throw new GrantError(400, 'bad_scopes', `scopes must be a non-empty list from: ${ALL_SCOPES.join(', ')}.`);
  const student = await studentByPairingCode(db, String(input.code ?? ''));
  if (!student) throw new GrantError(404, 'unknown_code', 'That pairing code is not known. Ask the student for the code on their Activity page.');
  const open = await db.execute({ sql: `SELECT COUNT(*) AS n FROM access_requests WHERE student_id = ? AND status = 'pending'`, args: [student.id] });
  if (Number(open.rows[0]!.n) >= 5) throw new GrantError(429, 'too_many_requests', 'This student already has 5 requests waiting. Try again later.');
  const id = randomId('req');
  const pollSecret = randomId('poll', 18);
  await db.execute({ sql: `INSERT INTO access_requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, args: [id, student.id, name, origin, JSON.stringify(scopes), reason, 'pending', sha256(pollSecret), null, null, new Date().toISOString(), null] });
  await appendLedger(db, student.id, { type: 'access_request', decision: 'requested', caller: { kind: 'outside', name, origin }, scopes, reason });
  return { id, pollSecret, student };
}

export async function pendingRequests(db: Client, studentId: string): Promise<AccessRequestRow[]> {
  const r = await db.execute({ sql: `SELECT * FROM access_requests WHERE student_id = ? AND status = 'pending' ORDER BY created_at DESC`, args: [studentId] });
  return r.rows.map(rowToRequest);
}

// ---- Step 3 and 4: the student decides, the site signs ----

export async function decideRequest(db: Client, student: Student, requestId: string, decision: 'approve' | 'decline', opts: { scopes?: string[]; ttl?: string } = {}): Promise<{ grant?: GrantRow }> {
  const r = await db.execute({ sql: `SELECT * FROM access_requests WHERE id = ? AND student_id = ? AND status = 'pending'`, args: [requestId, student.id] });
  const row = r.rows[0];
  if (!row) throw new GrantError(404, 'no_such_request', 'That request is not waiting for an answer.');
  const req = rowToRequest(row);
  if (decision === 'decline') {
    await db.execute({ sql: `UPDATE access_requests SET status = 'declined', decided_at = ? WHERE id = ?`, args: [new Date().toISOString(), requestId] });
    await appendLedger(db, student.id, { type: 'grant', decision: 'denied', caller: { kind: 'outside', name: req.agentName, origin: req.origin }, scopes: req.scopes, reason: 'The student declined the request.' });
    return {};
  }
  const chosen = (opts.scopes ?? req.scopes).filter((s) => req.scopes.includes(s as Scope)) as Scope[];
  if (!chosen.length) throw new GrantError(400, 'no_scopes', 'Choose at least one of the requested scopes, or decline.');
  const ttlKey = (opts.ttl && opts.ttl in TTL_CHOICES ? opts.ttl : '1h') as Ttl;
  const ttl = TTL_CHOICES[ttlKey];
  const gid = randomId('grant', 8);
  const now = new Date();
  const exp = new Date(now.getTime() + ttl * 1000);
  const signer = await getSigner(db);
  const body = b64u(Buffer.from(canonical({ gid, aud: req.origin, scp: chosen, iat: Math.floor(now.getTime() / 1000), exp: Math.floor(exp.getTime() / 1000), kid: signer.kid })));
  const token = `${TOKEN_PREFIX}.${body}.${signText(signer, `${TOKEN_PREFIX}.${body}`)}`;
  await db.batch(
    [
      { sql: `INSERT INTO grants VALUES (?,?,?,?,?,?,?,?)`, args: [gid, student.id, req.agentName, req.origin, JSON.stringify(chosen), now.toISOString(), exp.toISOString(), null] },
      { sql: `UPDATE access_requests SET status = 'approved', grant_id = ?, token = ?, decided_at = ? WHERE id = ?`, args: [gid, token, now.toISOString(), requestId] },
    ],
    'write',
  );
  await appendLedger(db, student.id, { type: 'grant', decision: 'issued', caller: { kind: 'outside', name: req.agentName, origin: req.origin }, grantId: gid, scopes: chosen, reason: `Access lasts ${TTL_WORDS[ttlKey]} unless you end it sooner.` });
  return { grant: { id: gid, agentName: req.agentName, origin: req.origin, scopes: chosen, createdAt: now.toISOString(), expiresAt: exp.toISOString() } };
}

/** The agent polls with the secret it was given. The token is handed over once and then removed from the database. */
export async function pollRequest(db: Client, requestId: string, pollSecret: string): Promise<{ status: string; token?: string; grant?: { id: string; scopes: Scope[]; expires_at: string } }> {
  const r = await db.execute({ sql: `SELECT * FROM access_requests WHERE id = ? AND poll_secret_hash = ?`, args: [requestId, sha256(pollSecret)] });
  const row = r.rows[0];
  if (!row) throw new GrantError(404, 'no_such_request', 'No request matches that id and secret.');
  const status = String(row.status);
  if (status === 'approved' && row.token) {
    const token = String(row.token);
    await db.execute({ sql: `UPDATE access_requests SET status = 'delivered', token = NULL WHERE id = ?`, args: [requestId] });
    const g = await db.execute({ sql: `SELECT * FROM grants WHERE id = ?`, args: [String(row.grant_id)] });
    const grant = rowToGrant(g.rows[0]!);
    return { status: 'approved', token, grant: { id: grant.id, scopes: grant.scopes, expires_at: grant.expiresAt } };
  }
  return { status: status === 'delivered' ? 'already_delivered' : status };
}

export async function listGrants(db: Client, studentId: string): Promise<GrantRow[]> {
  const r = await db.execute({ sql: `SELECT * FROM grants WHERE student_id = ? ORDER BY created_at DESC LIMIT 50`, args: [studentId] });
  return r.rows.map(rowToGrant);
}

export async function revokeGrant(db: Client, student: Student, grantId: string): Promise<boolean> {
  const r = await db.execute({ sql: `UPDATE grants SET revoked_at = ? WHERE id = ? AND student_id = ? AND revoked_at IS NULL RETURNING *`, args: [new Date().toISOString(), grantId, student.id] });
  if (!r.rows[0]) return false;
  const g = rowToGrant(r.rows[0]);
  await appendLedger(db, student.id, { type: 'revoke', decision: 'revoked', caller: { kind: 'outside', name: g.agentName, origin: g.origin }, grantId: g.id, scopes: g.scopes, reason: 'The student ended this access.' });
  return true;
}

// ---- Step 5: using a token ----

export interface Authed {
  grant: GrantRow;
  student: Student;
}

/** Check a bearer token. On any failure a "denied" entry is written to the student's ledger when the grant is known. */
export async function authenticateToken(db: Client, bearer: string | null, originHeader: string | null, scopeNeeded?: Scope, toolName?: string): Promise<Authed> {
  if (!bearer || !bearer.startsWith(`${TOKEN_PREFIX}.`)) throw new GrantError(401, 'no_token', 'Send a grant token: Authorization: Bearer cdg1.…');
  const [prefix, body, sig] = bearer.split('.');
  if (!prefix || !body || !sig) throw new GrantError(401, 'bad_token', 'The token is malformed.');
  const signer = await getSigner(db);
  if (!verifyText(signer.publicKey, `${prefix}.${body}`, sig)) throw new GrantError(401, 'bad_signature', 'The token signature is not valid for this site.');
  let claims: { gid: string; aud: string; scp: Scope[]; exp: number };
  try {
    claims = JSON.parse(fromB64u(body).toString('utf8'));
  } catch {
    throw new GrantError(401, 'bad_token', 'The token is malformed.');
  }
  const g = await db.execute({ sql: `SELECT * FROM grants WHERE id = ?`, args: [claims.gid] });
  if (!g.rows[0]) throw new GrantError(401, 'unknown_grant', 'This grant does not exist here.');
  const grant = rowToGrant(g.rows[0]);
  const student = await studentById(db, String(g.rows[0].student_id));
  if (!student) throw new GrantError(401, 'unknown_grant', 'This grant does not exist here.');
  const caller = { kind: 'outside' as const, name: grant.agentName, origin: grant.origin };
  const deny = async (status: number, code: string, message: string): Promise<never> => {
    await appendLedger(db, student.id, { type: 'tool', decision: 'denied', caller, tool: toolName, grantId: grant.id, scopes: scopeNeeded ? [scopeNeeded] : undefined, reason: message });
    throw new GrantError(status, code, message);
  };
  if (grant.revokedAt) return deny(401, 'revoked', 'The student has ended this access.');
  if (new Date(grant.expiresAt).getTime() < Date.now()) return deny(401, 'expired', 'This grant has expired.');
  if (originHeader && originHeader !== grant.origin) return deny(403, 'wrong_origin', `This grant is for ${grant.origin}, but the call came from ${originHeader}.`);
  if (scopeNeeded && !grant.scopes.includes(scopeNeeded)) return deny(403, 'missing_scope', `This grant does not include ${scopeNeeded} (${SCOPES[scopeNeeded]}).`);
  return { grant, student };
}
