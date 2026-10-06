"use client";

import { useState } from "react";
import type { TasteCard } from "@/lib/types";
import { domainColor } from "@/components/domain";
import CARD_IMAGES from "@/data/card-images.json";

/**
 * Card image with graceful fallback: resolves a CC-licensed Wikipedia
 * thumbnail through /api/img; if unavailable, renders a deterministic
 * gradient + monogram derived from the card. While loading, a soft gradient
 * placeholder shows; the image settles in (blur → sharp) once decoded.
 */
// Wikipedia lead images for these are portraits; we show an instant typographic tile instead
const PORTRAIT_IDS = new Set(["kusama", "banksy", "basquiat", "kahlo", "murakami-takashi", "olafur-eliasson", "yohji-yamamoto", "vivienne-westwood", "rick-owens", "margiela"]);

/**
 * Direct photo URL for a card, or null when none is known. Live Qloo cards ship their own
 * image; seed cards use the pre-resolved map (scripts/resolve-card-images.mjs) so the feed
 * never waits on Wikipedia lookups.
 */
export function cardImageSrc(card: TasteCard): string | null {
  return card.imageUrl ?? (CARD_IMAGES as Record<string, string>)[card.id] ?? null;
}

export function CardImage({ card, width = 640, alt, eager = false }: { card: TasteCard; width?: number; alt?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(card.domain === "music" || PORTRAIT_IDS.has(card.id));
  const [loaded, setLoaded] = useState(false);
  const color = domainColor(card.domain);
  const initials = card.title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const placeholderBg = `radial-gradient(120% 90% at 20% 10%, ${color}26 0%, transparent 55%), radial-gradient(120% 100% at 85% 90%, ${color}1a 0%, transparent 50%), linear-gradient(160deg, #17171a 0%, #0e0e10 100%)`;

  if (failed) {
    return (
      <div
        aria-label={alt ?? card.title}
        role="img"
        className="absolute inset-0 flex flex-col justify-between p-4"
        style={{ background: placeholderBg }}
      >
        <span className="font-display text-4xl" style={{ color: `${color}66` }}>
          {initials}
        </span>
        <span className="font-display text-xl leading-tight max-w-[85%]">{card.title}</span>
      </div>
    );
  }

  // live Qloo entities ship their own image URLs; seed cards resolve via Wikipedia
  const src = cardImageSrc(card) ?? `/api/img?${new URLSearchParams({ title: card.wikiTitle ?? card.title, w: String(width) })}`;
  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-start p-4" style={{ background: placeholderBg }} aria-hidden>
          <span className="font-display text-4xl" style={{ color: `${color}55` }}>
            {initials}
          </span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? card.title}
        className={`absolute inset-0 w-full h-full object-cover ${loaded ? "img-settle" : "opacity-0"}`}
        loading={eager ? "eager" : "lazy"}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}
