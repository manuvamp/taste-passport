"use client";

import { useState } from "react";
import type { TasteCard } from "@/lib/types";
import { domainColor } from "@/components/domain";

/**
 * Card image with graceful fallback: resolves a CC-licensed Wikipedia
 * thumbnail through /api/img; if unavailable, renders a deterministic
 * gradient derived from the card id + tags.
 */
export function CardImage({ card, width = 640, alt }: { card: TasteCard; width?: number; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const color = domainColor(card.domain);

  if (failed) {
    return (
      <div
        aria-label={alt ?? card.title}
        role="img"
        className="absolute inset-0 flex items-end p-5"
        style={{
          background: `radial-gradient(120% 90% at 20% 10%, ${color}33 0%, transparent 55%), radial-gradient(120% 100% at 85% 90%, ${color}22 0%, transparent 50%), linear-gradient(160deg, #17171a 0%, #0e0e10 100%)`,
        }}
      >
        <span className="font-display text-3xl leading-tight max-w-[85%]">{card.title}</span>
      </div>
    );
  }

  // live Qloo entities ship their own image URLs; seed cards resolve via Wikipedia
  const src = card.imageUrl ?? `/api/img?${new URLSearchParams({ title: card.wikiTitle ?? card.title, w: String(width) })}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? card.title}
      className="absolute inset-0 w-full h-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
