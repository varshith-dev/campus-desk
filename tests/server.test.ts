import { describe, expect, it } from 'vitest';
import { makeDesk } from './helpers';
import { authenticateToken, createAccessRequest, decideRequest, GrantError, listGrants, normaliseOrigin, pendingRequests, pollRequest, revokeGrant } from '../lib/grants';
import { appendLedger, keysDocument, listLedger, verifyChain, verifyReceipt } from '../lib/ledger';
import { AuthError, guestForToken, createSession, createStudent, endSession, listReminders, addReminder, mergeGuestReminders, signIn, signUp, studentByPairingCode, studentFromSession, decideReminder, rotatePairingCode } from '../lib/store';
import { checkPassword, hashPassword } from '../lib/crypto';
import { runTool, ToolError } from '../lib/tools';
import { DEFAULT_PROFILE } from '../src/data/model';

const ORIGIN = 'https://library.example';
async function grantFor(desk: Awaited<ReturnType<typeof makeDesk>>, scopes = ['timetable:read', 'exams:read'], ttl = '1h') {
  const req = await createAccessRequest(desk.db, { code: desk.student.pairingCode, name: 'Study planner', origin: ORIGIN, scopes, reason: 'Plan study time before exams' });
  const { grant } = await decideRequest(desk.db, desk.student, req.id, 'approve', { ttl });
  const polled = await pollRequest(desk.db, req.id, req.pollSecret);
  return { req, grant: grant!, token: polled.token! };
}

describe('passwords and sessions', () => {
  it('hashes with a salt, accepts the right passphrase and rejects others', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toBe(b);
    expect(a).not.toContain('correct');
    expect(await checkPassword('correct horse battery', a)).toBe(true);
    expect(await checkPassword('wrong', a)).toBe(false);
  });
  it('signs up, signs in with any email case, and gives the same error for a wrong passphrase and an unknown email', async () => {
    const { db } = await makeDesk();
    await signUp(db, { name: 'Ravi', email: 'Ravi@Eastbrook.Example', password: 'a long passphrase', profile: DEFAULT_PROFILE });
    expect((await signIn(db, 'ravi@eastbrook.example', 'a long passphrase')).name).toBe('Ravi');
    const wrong = await signIn(db, 'ravi@eastbrook.example', 'nope').catch((e) => e);
    const unknown = await signIn(db, 'nobody@eastbrook.example', 'nope').catch((e) => e);
    expect(wrong).toBeInstanceOf(AuthError);
    expect(wrong.message).toBe(unknown.message);
    await expect(signUp(db, { name: 'Ravi 2', email: 'ravi@eastbrook.example', password: 'another passphrase', profile: DEFAULT_PROFILE })).rejects.toBeInstanceOf(AuthError);
  });
  it('keeps only a hash of the session token and ends it on sign-out', async () => {
    const { db, student } = await makeDesk();
    const s = await createSession(db, student.id);
    const stored = await db.execute({ sql: 'SELECT * FROM sessions', args: [] });
    expect(JSON.stringify(stored.rows)).not.toContain(s.token);
    expect((await studentFromSession(db, s.token))?.id).toBe(student.id);
    await endSession(db, s.token);
    expect(await studentFromSession(db, s.token)).toBeNull();
    expect(await studentFromSession(db, undefined)).toBeNull();
  });
  it('moves a guest’s reminders into the account on sign-in, once', async () => {
    const { db, student: guest } = await makeDesk();
    const acct = await createStudent(db, { kind: 'account', name: 'A', email: 'a@x.example', password: 'passphrase one two', profile: DEFAULT_PROFILE });
    await addReminder(db, guest.id, { title: 'Revise', date: '2026-12-01', status: 'saved', source: 'you' });
    await addReminder(db, guest.id, { title: 'Pending from outside', date: '2026-12-02', status: 'pending', source: 'x' });
    expect(await mergeGuestReminders(db, guest.id, acct.id)).toBe(2);
    expect((await listReminders(db, acct.id)).map((r) => r.title).sort()).toEqual(['Pending from outside', 'Revise']);
    expect(await listReminders(db, guest.id)).toHaveLength(0);
    expect(await mergeGuestReminders(db, guest.id, acct.id)).toBe(0);
  });
  it('makes one guest for one token, even when many requests arrive at the same moment', async () => {
    const { db } = await makeDesk();
    const token = 'x'.repeat(43);
    const all = await Promise.all(Array.from({ length: 8 }, () => guestForToken(db, token)));
    expect(new Set(all.map((s) => s.id)).size).toBe(1);
    expect(new Set(all.map((s) => s.pairingCode)).size).toBe(1);
    expect((await studentFromSession(db, token))?.id).toBe(all[0]!.id);
    expect((await guestForToken(db, 'y'.repeat(43))).id).not.toBe(all[0]!.id);
  });
  it('rotates the pairing code and the old one stops working', async () => {
    const { db, student } = await makeDesk();
    const next = await rotatePairingCode(db, student.id);
    expect(next).not.toBe(student.pairingCode);
    expect(await studentByPairingCode(db, student.pairingCode)).toBeNull();
    expect((await studentByPairingCode(db, next.toLowerCase()))?.id).toBe(student.id);
  });
});

describe('signed ledger', () => {
  it('chains entries, verifies, and never stores the student id or private values', async () => {
    const { db, student } = await makeDesk();
    await appendLedger(db, student.id, { type: 'consent', decision: 'allowed', caller: { kind: 'desk', name: 'Campus Desk' }, tool: 'x', fields: ['year', 'section'] });
    await appendLedger(db, student.id, { type: 'tool', decision: 'allowed', caller: { kind: 'desk', name: 'Campus Desk' }, tool: 'get_timetable' });
    const list = await listLedger(db, student.id);
    expect(list).toHaveLength(2);
    expect(list[0]!.prev_hash).toBe(list[1]!.hash);
    expect(JSON.stringify(list)).not.toContain(student.id);
    expect(await verifyChain(db, student.id)).toEqual({ ok: true, entries: 2 });
    expect(await verifyReceipt(db, list[0]!)).toEqual({ ok: true });
  });
  it('detects an edited entry, a removed entry and a forged signature', async () => {
    const { db, student } = await makeDesk();
    for (let i = 0; i < 4; i++) await appendLedger(db, student.id, { type: 'tool', decision: 'allowed', caller: { kind: 'desk', name: 'Campus Desk' }, tool: `t${i}` });
    const rows = (await db.execute({ sql: 'SELECT seq, payload FROM ledger WHERE student_id = ? ORDER BY seq', args: [student.id] })).rows;
    await db.execute({ sql: 'UPDATE ledger SET payload = ? WHERE seq = ?', args: [String(rows[1]!.payload).replace('t1', 'tX'), rows[1]!.seq as number] });
    const edited = await verifyChain(db, student.id);
    expect(edited.ok).toBe(false);
    expect(edited.brokenAt).toBe(Number(rows[1]!.seq));
    await db.execute({ sql: 'UPDATE ledger SET payload = ? WHERE seq = ?', args: [rows[1]!.payload as string, rows[1]!.seq as number] });
    expect((await verifyChain(db, student.id)).ok).toBe(true);
    await db.execute({ sql: 'DELETE FROM ledger WHERE seq = ?', args: [rows[2]!.seq as number] });
    expect((await verifyChain(db, student.id)).ok).toBe(false);
  });
  it('rejects a receipt whose text was changed or signature swapped', async () => {
    const { db, student } = await makeDesk();
    const r = await appendLedger(db, student.id, { type: 'tool', decision: 'allowed', caller: { kind: 'desk', name: 'Campus Desk' }, tool: 'get_timetable' });
    expect((await verifyReceipt(db, { ...r, payload: { ...r.payload, decision: 'denied' } })).ok).toBe(false);
    const other = await appendLedger(db, student.id, { type: 'tool', decision: 'allowed', caller: { kind: 'desk', name: 'Campus Desk' }, tool: 'other' });
    expect((await verifyReceipt(db, { ...r, sig: other.sig })).ok).toBe(false);
    expect((await verifyReceipt(db, {} as never)).ok).toBe(false);
  });
  it('publishes the public key and no private part', async () => {
    const { db } = await makeDesk();
    const k = await keysDocument(db);
    expect(k.keys[0]).toMatchObject({ kty: 'OKP', crv: 'Ed25519' });
    expect(JSON.stringify(k)).not.toContain('"d"');
  });
  it('keeps each student’s chain separate', async () => {
    const a = await makeDesk();
    const b = await createStudent(a.db, { kind: 'guest', profile: DEFAULT_PROFILE });
    await appendLedger(a.db, a.student.id, { type: 'tool', decision: 'allowed', caller: { kind: 'desk', name: 'Campus Desk' }, tool: 'a' });
    expect(await listLedger(a.db, b.id)).toHaveLength(0);
    expect((await verifyChain(a.db, b.id)).entries).toBe(0);
  });
});

describe('access requests and grants', () => {
  it('runs the whole hand-off: request, approve a narrower set, collect once, call, revoke', async () => {
    const desk = await makeDesk();
    const req = await createAccessRequest(desk.db, { code: desk.student.pairingCode, name: 'Study planner', origin: ORIGIN + '/path?x=1', scopes: ['timetable:read', 'exams:read', 'fees:read'], reason: 'Plan study time before exams' });
    expect(await pollRequest(desk.db, req.id, req.pollSecret)).toEqual({ status: 'pending' });
    expect((await pendingRequests(desk.db, desk.student.id))[0]).toMatchObject({ origin: ORIGIN, scopes: ['timetable:read', 'exams:read', 'fees:read'] });
    const { grant } = await decideRequest(desk.db, desk.student, req.id, 'approve', { scopes: ['exams:read'], ttl: '15m' });
    expect(grant!.scopes).toEqual(['exams:read']);
    const first = await pollRequest(desk.db, req.id, req.pollSecret);
    expect(first.token).toMatch(/^cdg1\./);
    expect((await pollRequest(desk.db, req.id, req.pollSecret)).status).toBe('already_delivered');
    const stored = await desk.db.execute({ sql: 'SELECT token FROM access_requests WHERE id = ?', args: [req.id] });
    expect(stored.rows[0]!.token).toBeNull();
    const ok = await authenticateToken(desk.db, first.token!, ORIGIN, 'exams:read', 'get_exam_dates');
    expect(ok.grant.id).toBe(grant!.id);
    expect(await revokeGrant(desk.db, desk.student, grant!.id)).toBe(true);
    expect(await revokeGrant(desk.db, desk.student, grant!.id)).toBe(false);
    await expect(authenticateToken(desk.db, first.token!, ORIGIN, 'exams:read')).rejects.toMatchObject({ code: 'revoked', status: 401 });
  });
  it('cannot widen the scopes beyond what was asked for', async () => {
    const desk = await makeDesk();
    const req = await createAccessRequest(desk.db, { code: desk.student.pairingCode, name: 'Planner', origin: ORIGIN, scopes: ['exams:read'], reason: 'Plan study time before exams' });
    const { grant } = await decideRequest(desk.db, desk.student, req.id, 'approve', { scopes: ['exams:read', 'fees:read'] });
    expect(grant!.scopes).toEqual(['exams:read']);
    await expect(decideRequest(desk.db, desk.student, (await createAccessRequest(desk.db, { code: desk.student.pairingCode, name: 'P2', origin: ORIGIN, scopes: ['exams:read'], reason: 'Plan study time before exams' })).id, 'approve', { scopes: ['fees:read'] })).rejects.toMatchObject({ code: 'no_scopes' });
  });
  it('refuses a missing scope, a wrong origin, an expired grant and a tampered token, and records each', async () => {
    const desk = await makeDesk();
    const { token, grant } = await grantFor(desk, ['exams:read']);
    await expect(authenticateToken(desk.db, token, ORIGIN, 'fees:read', 'get_fee_dates')).rejects.toMatchObject({ code: 'missing_scope', status: 403 });
    await expect(authenticateToken(desk.db, token, 'https://evil.example', 'exams:read')).rejects.toMatchObject({ code: 'wrong_origin', status: 403 });
    const [h, body, sig] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString()), scp: ['fees:read', 'exams:read'] })).toString('base64url');
    await expect(authenticateToken(desk.db, `${h}.${forgedBody}.${sig}`, ORIGIN, 'fees:read')).rejects.toMatchObject({ code: 'bad_signature', status: 401 });
    await expect(authenticateToken(desk.db, 'cdg1.abc', ORIGIN)).rejects.toBeInstanceOf(GrantError);
    await expect(authenticateToken(desk.db, null, ORIGIN)).rejects.toMatchObject({ code: 'no_token' });
    await desk.db.execute({ sql: 'UPDATE grants SET expires_at = ? WHERE id = ?', args: [new Date(Date.now() - 1000).toISOString(), grant.id] });
    await expect(authenticateToken(desk.db, token, ORIGIN, 'exams:read')).rejects.toMatchObject({ code: 'expired' });
    const denied = (await listLedger(desk.db, desk.student.id)).filter((e) => e.payload.decision === 'denied');
    expect(denied.map((e) => e.payload.reason).join(' ')).toMatch(/fees:read/);
    expect(denied.length).toBe(3);
    expect((await verifyChain(desk.db, desk.student.id)).ok).toBe(true);
  });
  it('does not let a token issued on one site work on another database', async () => {
    const a = await makeDesk();
    const b = await makeDesk();
    const { token } = await grantFor(a);
    await expect(authenticateToken(b.db, token, ORIGIN)).rejects.toMatchObject({ code: 'bad_signature' });
  });
  it('handles a decline, bad input and too many waiting requests', async () => {
    const desk = await makeDesk();
    const base = { code: desk.student.pairingCode, name: 'Planner', origin: ORIGIN, scopes: ['exams:read'], reason: 'Plan study time before exams' };
    const r = await createAccessRequest(desk.db, base);
    await decideRequest(desk.db, desk.student, r.id, 'decline');
    expect((await pollRequest(desk.db, r.id, r.pollSecret)).status).toBe('declined');
    expect(await listGrants(desk.db, desk.student.id)).toHaveLength(0);
    await expect(decideRequest(desk.db, desk.student, r.id, 'approve')).rejects.toMatchObject({ code: 'no_such_request' });
    await expect(pollRequest(desk.db, r.id, 'wrong-secret')).rejects.toMatchObject({ status: 404 });
    await expect(createAccessRequest(desk.db, { ...base, code: 'EB-NOPE22' })).rejects.toMatchObject({ code: 'unknown_code' });
    await expect(createAccessRequest(desk.db, { ...base, scopes: ['everything'] })).rejects.toMatchObject({ code: 'bad_scopes' });
    await expect(createAccessRequest(desk.db, { ...base, scopes: [] })).rejects.toMatchObject({ code: 'bad_scopes' });
    await expect(createAccessRequest(desk.db, { ...base, reason: 'x' })).rejects.toMatchObject({ code: 'bad_reason' });
    await expect(createAccessRequest(desk.db, { ...base, origin: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'bad_origin' });
    for (let i = 0; i < 5; i++) await createAccessRequest(desk.db, base);
    await expect(createAccessRequest(desk.db, base)).rejects.toMatchObject({ status: 429 });
  });
  it('only lets the owner decide a request', async () => {
    const desk = await makeDesk();
    const other = await createStudent(desk.db, { kind: 'guest', profile: DEFAULT_PROFILE });
    const r = await createAccessRequest(desk.db, { code: desk.student.pairingCode, name: 'Planner', origin: ORIGIN, scopes: ['exams:read'], reason: 'Plan study time before exams' });
    await expect(decideRequest(desk.db, other, r.id, 'approve')).rejects.toMatchObject({ code: 'no_such_request' });
    const { grant } = await decideRequest(desk.db, desk.student, r.id, 'approve');
    expect(await revokeGrant(desk.db, other, grant!.id)).toBe(false);
  });
  it('normalises origins', () => {
    expect(normaliseOrigin('https://Library.example/a/b?c#d')).toBe('https://library.example');
    expect(() => normaliseOrigin('ftp://x')).toThrow(GrantError);
    expect(() => normaliseOrigin('not a url')).toThrow(GrantError);
  });
});

describe('what an outside agent can and cannot do through the tools', () => {
  it('keeps the student’s private context out of its answers’ requirements: it never passes year or section', async () => {
    const desk = await makeDesk({ year: 3, section: 'B', feeCategory: 'scholarship' });
    const { result } = await runTool('get_timetable', { day: 'monday' }, { db: desk.db, student: desk.student, write: 'propose', source: 'outside' });
    expect(JSON.stringify(result)).toMatch(/classes/);
    expect(JSON.stringify(result)).not.toContain('scholarship');
  });
  it('turns an outside write into a pending reminder, never a saved one', async () => {
    const desk = await makeDesk();
    const { result } = await runTool('save_reminder', { title: 'Revise OS', date: '2026-12-01' }, { db: desk.db, student: desk.student, write: 'propose', source: 'Planner (https://library.example)', grantId: 'g1' });
    expect(result).toMatchObject({ ok: true, pending: true });
    expect(await listReminders(desk.db, desk.student.id, 'saved')).toHaveLength(0);
    const [pending] = await listReminders(desk.db, desk.student.id, 'pending');
    expect(pending!.source).toContain('Planner');
    expect((await decideReminder(desk.db, desk.student.id, pending!.id, 'saved'))?.status).toBe('saved');
  });
  it('rejects bad arguments and unknown tools with a plain message', async () => {
    const desk = await makeDesk();
    const ctx = { db: desk.db, student: desk.student, write: 'propose' as const, source: 't' };
    await expect(runTool('get_timetable', { day: 42 }, ctx)).rejects.toBeInstanceOf(ToolError);
    await expect(runTool('drop_tables', {}, ctx)).rejects.toMatchObject({ code: 'unknown_tool' });
    await expect(runTool('save_reminder', { title: '', date: 'tomorrow' }, ctx)).rejects.toBeInstanceOf(ToolError);
  });
});
