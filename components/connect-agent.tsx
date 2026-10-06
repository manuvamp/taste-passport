"use client";

import { useEffect, useState } from "react";

type Tab = "mcp" | "api" | "stdio";

/**
 * "Plug your taste into an agent" panel. With a real session it shows copy-ready
 * snippets carrying the user's session id; without one it shows placeholders.
 */
export function ConnectAgent({ live = true }: { live?: boolean }) {
  const [sid, setSid] = useState<string | null>(null);
  const [origin, setOrigin] = useState("https://your-taste-passport.app");
  const [tab, setTab] = useState<Tab>("mcp");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (!live) return;
    fetch("/api/session")
      .then((r) => r.json())
      .then((d: { sessionId?: string }) => setSid(d.sessionId ?? null))
      .catch(() => {});
  }, [live]);

  const id = sid ?? "<your-session-id>";
  const snippets: Record<Tab, { label: string; hint: string; code: string }> = {
    mcp: {
      label: "MCP (remote)",
      hint: "Add to Claude Code, Cursor or any remote-MCP client",
      code: `claude mcp add --transport http taste-passport "${origin}/api/mcp?sid=${id}"`,
    },
    api: {
      label: "JSON API",
      hint: "Fetch your profile from any agent or script",
      code: `curl "${origin}/api/taste/profile?sid=${id}"`,
    },
    stdio: {
      label: "MCP (local)",
      hint: "For clients that only speak stdio",
      code: `TASTE_PASSPORT_URL=${origin} TASTE_SESSION_ID=${id} node mcp/server.mjs`,
    },
  };
  const cur = snippets[tab];

  const copy = () => {
    navigator.clipboard?.writeText(cur.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="border hairline rounded-2xl overflow-hidden bg-[var(--bg-soft)]">
      <div className="flex border-b hairline text-xs overflow-x-auto" role="tablist">
        {(Object.keys(snippets) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 whitespace-nowrap transition-colors ${tab === t ? "text-[var(--ink)] bg-[var(--bg-softer)]" : "dim hover:text-[var(--ink)]"}`}
          >
            {snippets[t].label}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-5">
        <p className="dim text-xs mb-3">{cur.hint}</p>
        <div className="flex items-start gap-3">
          <pre className="flex-1 min-w-0 text-xs sm:text-[13px] leading-relaxed font-mono whitespace-pre-wrap break-all">{cur.code}</pre>
          <button onClick={copy} className="btn-ghost text-xs !py-1.5 !px-3 shrink-0">
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        {live && !sid && <p className="faint text-[11px] mt-3">Finish building your taste to get your personal link.</p>}
      </div>
    </div>
  );
}
