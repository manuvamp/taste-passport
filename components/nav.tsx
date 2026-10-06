import Link from "next/link";

export function Nav({ mode }: { mode?: string }) {
  return (
    <nav className="flex items-center justify-between px-4 sm:px-8 py-4 border-b hairline sticky top-0 z-40 bg-[var(--bg)]/85 backdrop-blur-sm">
      <Link href="/" className="font-display text-lg tracking-tight shrink-0">
        Taste Passport
      </Link>
      <div className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm dim whitespace-nowrap">
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
          Demo
        </Link>
        <Link href="/eval" className="hover:text-[var(--ink)] transition-colors hidden sm:inline" title="Run the generic-vs-taste evaluation">
          Eval
        </Link>
        <Link href="/dev" className="hover:text-[var(--ink)] transition-colors opacity-50 hover:opacity-100 hidden sm:inline" title="Developer dashboard">
          ⚙
        </Link>
        {mode && (
          <span
            className="text-[10px] uppercase tracking-widest border hairline rounded-full px-2 py-0.5"
            title={mode === "live" ? "Live Qloo API" : "Deterministic offline taste graph (set QLOO_MODE=live + QLOO_API_KEY)"}
          >
            {mode}
          </span>
        )}
      </div>
    </nav>
  );
}
