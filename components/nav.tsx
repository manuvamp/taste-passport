import Link from "next/link";

export function Nav({ mode }: { mode?: string }) {
  return (
    <nav className="flex items-center justify-between px-5 sm:px-8 py-4 border-b hairline">
      <Link href="/" className="font-display text-lg tracking-tight">
        Taste Passport
      </Link>
      <div className="flex items-center gap-4 sm:gap-6 text-sm dim">
        <Link href="/discover" className="hover:text-[var(--ink)] transition-colors">
          Discover
        </Link>
        <Link href="/profile" className="hover:text-[var(--ink)] transition-colors">
          Taste DNA
        </Link>
        <Link href="/agent" className="hover:text-[var(--ink)] transition-colors">
          Agent
        </Link>
        <Link href="/demo" className="hover:text-[var(--ink)] transition-colors hidden sm:inline">
          Demo users
        </Link>
        <Link href="/dev" className="hover:text-[var(--ink)] transition-colors opacity-50 hover:opacity-100 hidden sm:inline" title="Developer dashboard">
          ⚙
        </Link>
        {mode && (
          <span
            className="text-[10px] uppercase tracking-widest border hairline rounded-full px-2 py-0.5"
            title={mode === "live" ? "Live Qloo API" : "Deterministic mock taste graph (set QLOO_MODE=live + QLOO_API_KEY)"}
          >
            {mode}
          </span>
        )}
      </div>
    </nav>
  );
}
