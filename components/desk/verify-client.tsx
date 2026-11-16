'use client';

import { CircleCheck, CircleX } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { canonical } from '@/src/site/canonical';

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export function VerifyClient() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    const lines: string[] = [];
    try {
      const r = JSON.parse(text);
      if (!r || typeof r.payload !== 'object' || typeof r.hash !== 'string' || typeof r.sig !== 'string' || typeof r.prev_hash !== 'string') throw new Error('That is not a receipt. It needs payload, prev_hash, hash and sig.');
      const digest = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.prev_hash + canonical(r.payload))));
      if (digest !== r.hash) {
        setResult({ ok: false, lines: ['The receipt text does not match its hash. It was changed.'] });
        return;
      }
      lines.push('The hash matches the receipt text and the link to the previous entry.');
      const keys = await (await fetch('/.well-known/campus-desk-keys.json')).json();
      const jwk = keys.keys.find((k: { kid: string }) => k.kid === r.kid) ?? keys.keys[0];
      const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, { name: 'Ed25519' }, false, ['verify']);
      const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, fromB64u(r.sig), new TextEncoder().encode(r.hash));
      lines.push(ok ? `The signature verifies against the published key ${jwk.kid}.` : 'The signature does not verify against the published key.');
      setResult({ ok, lines });
    } catch (e) {
      setResult({ ok: false, lines: [e instanceof Error ? e.message : 'Could not check that.', ...lines] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <label htmlFor="receipt" className="sr-only">
        Receipt JSON
      </label>
      <Textarea id="receipt" value={text} onChange={(e) => setText(e.target.value)} rows={12} className="mono bg-card text-xs" placeholder={'{\n  "id": "rcpt_...",\n  "payload": { ... },\n  "prev_hash": "...",\n  "hash": "...",\n  "sig": "...",\n  "kid": "cd-..."\n}'} />
      <Button onClick={verify} disabled={busy || !text.trim()}>
        {busy ? 'Checking...' : 'Verify'}
      </Button>
      {result && (
        <div role="status" data-testid="verify-result" data-ok={result.ok} className={`rounded-lg border-2 p-4 ${result.ok ? 'border-sage bg-sage/10' : 'border-destructive bg-destructive/10'}`}>
          <p className="mb-2 flex items-center gap-2 font-display text-xl font-semibold">
            {result.ok ? <CircleCheck className="size-5 text-sage" /> : <CircleX className="size-5 text-destructive" />}
            {result.ok ? 'Genuine receipt' : 'Not valid'}
          </p>
          <ul className="space-y-1 text-sm">
            {result.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
