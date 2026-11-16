import Link from 'next/link';

/** The Eastbrook mark: a brick arch window. */
export function Mark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="var(--brick)" />
      <path d="M10 31V19a10 10 0 0 1 20 0v12" fill="none" stroke="#fff8ee" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M20 9v22M10 21h20" stroke="#fff8ee" strokeWidth="2" opacity=".9" />
      <rect x="6" y="31" width="28" height="3" rx="1.5" fill="var(--mustard)" />
    </svg>
  );
}

export function Brand({ sub }: { sub: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Campus Desk, home">
      <Mark />
      <span className="leading-tight">
        <span className="block font-display text-lg font-semibold tracking-tight">Campus Desk</span>
        <span className="eyebrow block text-[0.62rem]">{sub}</span>
      </span>
    </Link>
  );
}
