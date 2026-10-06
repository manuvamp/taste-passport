// Resolves each seed card to its Qloo entity image via /search and writes
// data/card-images.json ({cardId: url}), replacing Wikipedia photos where Qloo has one.
// Reads QLOO_API_KEY / QLOO_BASE_URL from .env.local (never printed).
// Run: node --experimental-strip-types scripts/resolve-qloo-images.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const BASE = env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";
const KEY = env.QLOO_API_KEY;
if (!KEY) throw new Error("QLOO_API_KEY missing in .env.local");

const TYPES = {
  music: "urn:entity:artist", film: "urn:entity:movie", tv: "urn:entity:tv_show", fashion: "urn:entity:brand",
  food: "urn:entity:place", travel: "urn:entity:destination", architecture: "urn:entity:place", book: "urn:entity:book",
  game: "urn:entity:video_game", brand: "urn:entity:brand", art: "urn:entity:place", lifestyle: "urn:entity:place",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = new URL("../data/card-images.json", import.meta.url);
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const qloo = {}; // ids already resolved via Qloo (so reruns skip them)
const QOUT = new URL("../data/.qloo-resolved.json", import.meta.url);
Object.assign(qloo, existsSync(QOUT) ? JSON.parse(readFileSync(QOUT, "utf8")) : {});

const pickUrl = (v) => {
  if (typeof v === "string") return v.startsWith("http") ? v : undefined;
  if (Array.isArray(v)) for (const x of v) { const u = pickUrl(x); if (u) return u; }
  if (v && typeof v === "object") return pickUrl(v.url) ?? pickUrl(v.image) ?? pickUrl(v.src);
  return undefined;
};

const cards = [...readFileSync(new URL("../data/cards.ts", import.meta.url), "utf8").matchAll(/\{ id: "([^"]+)", title: "([^"]+)", domain: "([^"]+)"/g)].map((m) => ({ id: m[1], title: m[2], domain: m[3] }));

let hit = 0;
for (const c of cards) {
  if (qloo[c.id] !== undefined) continue;
  const clean = c.title.split(/\s[—–-]\s/)[0];
  const p = new URLSearchParams({ query: clean, take: "5", types: TYPES[c.domain] });
  let url;
  for (let i = 0; i < 4 && url === undefined; i++) {
    const res = await fetch(`${BASE}/search?${p}`, { headers: { "X-Api-Key": KEY, accept: "application/json" } });
    if (res.status === 429) { await sleep(3000 * (i + 1)); continue; }
    if (!res.ok) break;
    const json = await res.json();
    // first result whose name matches loosely and has an image
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const rs = (json.results ?? []).filter((r) => pickUrl(r.properties?.images ?? r.properties?.image ?? r.image_url));
    const best = rs.find((r) => norm(r.name ?? "") === norm(clean)) ;
    url = best ? pickUrl(best.properties?.images ?? best.properties?.image ?? best.image_url) : null;
    break;
  }
  qloo[c.id] = url ?? null;
  if (url) { out[c.id] = url; hit++; }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  writeFileSync(QOUT, JSON.stringify(qloo, null, 1));
  await sleep(250);
}
console.log(`qloo images: ${Object.values(qloo).filter(Boolean).length}/${cards.length}; total mapped ${Object.keys(out).length}`);
console.log("no qloo image (kept wikipedia if any):", cards.filter((c) => !qloo[c.id]).map((c) => c.id).join(", "));
