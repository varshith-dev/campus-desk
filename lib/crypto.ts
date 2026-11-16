// Hashing, signing and password helpers. Node's built-in crypto only, no extra packages.
//   - Ed25519 signs consent receipts, ledger entries and agent grants. The public key is published.
//   - scrypt hashes student passphrases.
//   - SHA-256 hashes session tokens before they are stored.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, scrypt, sign, timingSafeEqual, verify, type KeyObject } from 'node:crypto';
import type { Client } from '@libsql/client';
import { canonical as _c } from '@/src/site/canonical';
void _c;

export const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
export const fromB64u = (s: string) => Buffer.from(s, 'base64url');
export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
export const randomId = (prefix: string, bytes = 9) => `${prefix}_${randomBytes(bytes).toString('base64url')}`;

export { canonical } from '@/src/site/canonical';

// ---- Signing keys ----

export interface Signer {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

let cached: { db: Client; signer: Promise<Signer> } | null = null;

function toSigner(pem: string): Signer {
  const privateKey = createPrivateKey(pem);
  const publicKey = createPublicKey(privateKey);
  const raw = publicKey.export({ format: 'der', type: 'spki' });
  return { kid: `cd-${sha256(raw).slice(0, 12)}`, privateKey, publicKey };
}

/**
 * The signing key. Order: SIGNING_KEY_PEM from the environment (use this on a real host), then a key kept in the
 * database, then a new key that is saved to the database. Receipts stay verifiable as long as the key stays.
 */
export function getSigner(db: Client): Promise<Signer> {
  if (cached?.db === db) return cached.signer;
  const signer = (async () => {
    const env = process.env.SIGNING_KEY_PEM;
    if (env) return toSigner(env.includes('BEGIN') ? env : Buffer.from(env, 'base64').toString('utf8'));
    const row = await db.execute(`SELECT v FROM kv WHERE k = 'signing_key'`);
    if (row.rows.length) return toSigner(String(row.rows[0]!.v));
    const { privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    await db.execute({ sql: `INSERT OR IGNORE INTO kv VALUES ('signing_key', ?)`, args: [pem] });
    const again = await db.execute(`SELECT v FROM kv WHERE k = 'signing_key'`);
    return toSigner(String(again.rows[0]!.v));
  })();
  cached = { db, signer };
  return signer;
}

export const signText = (s: Signer, text: string) => b64u(sign(null, Buffer.from(text), s.privateKey));
export function verifyText(publicKey: KeyObject, text: string, sig: string): boolean {
  try {
    return verify(null, Buffer.from(text), publicKey, fromB64u(sig));
  } catch {
    return false;
  }
}

/** The public key as a JWK, for /.well-known/campus-desk-keys.json. */
export function publicJwk(s: Signer) {
  return { ...s.publicKey.export({ format: 'jwk' }), kid: s.kid, alg: 'EdDSA', use: 'sig' };
}

// ---- Passwords ----

const scryptAsync = (pw: string, salt: Buffer) => new Promise<Buffer>((res, rej) => scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${b64u(salt)}$${b64u(await scryptAsync(pw, salt))}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = fromB64u(hash);
  const got = await scryptAsync(pw, fromB64u(salt));
  return want.length === got.length && timingSafeEqual(want, got);
}
