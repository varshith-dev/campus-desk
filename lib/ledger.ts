// The activity ledger: a hash chain of signed entries, one chain per student.
// Every tool call, consent decision, access grant and confirmation is an entry. An entry holds names and decisions,
// never private values: it can say that a tool used "fee_category", never what the category was.
import type { Client } from '@libsql/client';
import { canonical, getSigner, publicJwk, randomId, sha256, signText, verifyText } from './crypto';

export type LedgerType = 'tool' | 'consent' | 'confirm' | 'access_request' | 'grant' | 'revoke' | 'private_context';
export type Decision = 'allowed' | 'denied' | 'pending' | 'confirmed' | 'declined' | 'issued' | 'revoked' | 'requested' | 'withheld' | 'failed';

export interface LedgerInput {
  type: LedgerType;
  decision: Decision;
  caller: { kind: 'desk' | 'outside'; name: string; origin?: string };
  tool?: string;
  effect?: string;
  reason?: string;
  grantId?: string;
  scopes?: string[];
  /** Names of private fields a tool read. Never the values. */
  fields?: string[];
  args?: unknown;
  note?: string;
}

export interface Receipt {
  id: string;
  seq: number;
  ts: string;
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
  sig: string;
  kid: string;
}

const GENESIS = '0'.repeat(64);
const short = (v: unknown) => {
  const t = JSON.stringify(v);
  return t === undefined ? undefined : t.length > 240 ? `${t.slice(0, 237)}...` : t;
};

/** The student's id is never written to an entry. A short hash stands in, so a receipt can be shared safely. */
export const pseudonym = (studentId: string) => sha256(`student:${studentId}`).slice(0, 12);

export async function appendLedger(db: Client, studentId: string, input: LedgerInput): Promise<Receipt> {
  const signer = await getSigner(db);
  const id = randomId('rcpt', 8);
  const ts = new Date().toISOString();
  const payload: Record<string, unknown> = {
    v: 1,
    id,
    ts,
    student: pseudonym(studentId),
    type: input.type,
    decision: input.decision,
    caller: input.caller,
    tool: input.tool,
    effect: input.effect,
    reason: input.reason,
    grant: input.grantId,
    scopes: input.scopes,
    fields: input.fields,
    args: input.args === undefined ? undefined : short(input.args),
    note: input.note,
  };
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
  const tx = await db.transaction('write');
  try {
    const last = await tx.execute({ sql: `SELECT hash FROM ledger WHERE student_id = ? ORDER BY seq DESC LIMIT 1`, args: [studentId] });
    const prev = last.rows[0] ? String(last.rows[0].hash) : GENESIS;
    const hash = sha256(prev + canonical(payload));
    const sig = signText(signer, hash);
    const ins = await tx.execute({ sql: `INSERT INTO ledger (id, student_id, ts, payload, prev_hash, hash, sig, kid) VALUES (?,?,?,?,?,?,?,?)`, args: [id, studentId, ts, canonical(payload), prev, hash, sig, signer.kid] });
    await tx.commit();
    return { id, seq: Number(ins.lastInsertRowid), ts, payload, prev_hash: prev, hash, sig, kid: signer.kid };
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}

const rowToReceipt = (r: Record<string, unknown>): Receipt => ({ id: String(r.id), seq: Number(r.seq), ts: String(r.ts), payload: JSON.parse(String(r.payload)), prev_hash: String(r.prev_hash), hash: String(r.hash), sig: String(r.sig), kid: String(r.kid) });

export async function listLedger(db: Client, studentId: string, opts: { afterSeq?: number; limit?: number } = {}): Promise<Receipt[]> {
  const r = await db.execute({ sql: `SELECT * FROM ledger WHERE student_id = ? AND seq > ? ORDER BY seq DESC LIMIT ?`, args: [studentId, opts.afterSeq ?? 0, Math.min(opts.limit ?? 100, 500)] });
  return r.rows.map(rowToReceipt);
}

export interface ChainReport {
  ok: boolean;
  entries: number;
  brokenAt?: number;
  reason?: string;
}

/** Walk the whole chain: every hash must follow from the one before, and every signature must verify. */
export async function verifyChain(db: Client, studentId: string): Promise<ChainReport> {
  const signer = await getSigner(db);
  const r = await db.execute({ sql: `SELECT * FROM ledger WHERE student_id = ? ORDER BY seq`, args: [studentId] });
  let prev = GENESIS;
  for (const row of r.rows) {
    const e = rowToReceipt(row);
    if (e.prev_hash !== prev) return { ok: false, entries: r.rows.length, brokenAt: e.seq, reason: 'The link to the previous entry does not match.' };
    if (sha256(prev + canonical(e.payload)) !== e.hash) return { ok: false, entries: r.rows.length, brokenAt: e.seq, reason: 'The entry text does not match its hash.' };
    if (!verifyText(signer.publicKey, e.hash, e.sig)) return { ok: false, entries: r.rows.length, brokenAt: e.seq, reason: 'The signature does not verify.' };
    prev = e.hash;
  }
  return { ok: true, entries: r.rows.length };
}

/** Check one receipt on its own, the way an outside party would: payload and previous hash in, yes or no out. */
export async function verifyReceipt(db: Client, r: Pick<Receipt, 'payload' | 'prev_hash' | 'hash' | 'sig'>): Promise<{ ok: boolean; reason?: string }> {
  const signer = await getSigner(db);
  if (typeof r?.hash !== 'string' || typeof r.sig !== 'string' || typeof r.prev_hash !== 'string' || typeof r.payload !== 'object' || !r.payload) return { ok: false, reason: 'Not a receipt.' };
  if (sha256(r.prev_hash + canonical(r.payload)) !== r.hash) return { ok: false, reason: 'The receipt text does not match its hash.' };
  if (!verifyText(signer.publicKey, r.hash, r.sig)) return { ok: false, reason: 'The signature was not made by this site.' };
  return { ok: true };
}

export async function keysDocument(db: Client) {
  const signer = await getSigner(db);
  return { keys: [publicJwk(signer)], note: 'Ed25519 public key for Campus Desk receipts. A receipt is valid when sha256(prev_hash + canonical(payload)) equals hash and sig is a valid signature of hash.' };
}
