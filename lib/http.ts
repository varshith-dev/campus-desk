// Small helpers shared by the route handlers: sessions in cookies, JSON replies, CORS, and a rate limit.
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Client } from '@libsql/client';
import { getDb } from './db';
import { createSession, createStudent, guestForToken, studentFromSession, type Student } from './store';
import { DEFAULT_PROFILE } from '@/src/data/model';

export const SESSION_COOKIE = 'cd_session';

const cookieOptions = (maxAge: number) => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge });

/** For pages: the signed-in or guest student if there is one. Does not set a cookie. */
export async function peekStudent(): Promise<{ db: Client; student: Student | null }> {
  const db = await getDb();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return { db, student: await studentFromSession(db, token) };
}

/** For route handlers: the student, or a new guest with a session cookie. */
export async function ensureStudent(): Promise<{ db: Client; student: Student }> {
  const db = await getDb();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const found = await studentFromSession(db, token);
  if (found) return { db, student: found };
  // The proxy gives every first visit a token. Make the guest for it, the same way each time, so parallel calls agree.
  if (token && token.length >= 40) return { db, student: await guestForToken(db, token) };
  const student = await createStudent(db, { kind: 'guest', name: 'Guest', profile: DEFAULT_PROFILE });
  const s = await createSession(db, student.id);
  jar.set(SESSION_COOKIE, s.token, cookieOptions(s.maxAge));
  return { db, student };
}

export async function startSessionFor(db: Client, studentId: string): Promise<void> {
  const s = await createSession(db, studentId);
  (await cookies()).set(SESSION_COOKIE, s.token, cookieOptions(s.maxAge));
}

export async function clearSessionCookie(): Promise<string | undefined> {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  jar.delete(SESSION_COOKIE);
  return t;
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export const problem = (status: number, code: string, message: string, headers: Record<string, string> = {}) => json({ ok: false, error: { code, message } }, status, headers);

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** CORS for the endpoints outside agents call from their own origin. Auth is the bearer token, not cookies. */
export const AGENT_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id',
  'Access-Control-Max-Age': '600',
};
export const preflight = () => new NextResponse(null, { status: 204, headers: AGENT_CORS });

// ---- A small in-memory rate limit. It is per server instance, which is enough to stop a loop. ----
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return true;
}

export const clientKey = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
export const bearerOf = (req: Request) => /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
