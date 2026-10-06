// Pre-resolves one photo URL per seed card (Wikipedia lead image, Commons fallback) into
// data/card-images.json as { cardId: url }, so the feed never hits Wikipedia at runtime.
// Run: node --experimental-strip-types scripts/resolve-card-images.mjs
import { writeFileSync, existsSync, readFileSync } from "node:fs";
// parse seed cards straight from the source (avoids TS path aliases under plain node)
const SEED_CARDS = [...readFileSync(new URL("../data/cards.ts", import.meta.url), "utf8").matchAll(/\{ id: "([^"]+)", title: "([^"]+)", domain: "[^"]+"(?:, wikiTitle: "([^"]+)")?/g)].map((m) => ({
  id: m[1],
  title: m[2],
  wikiTitle: m[3],
}));

const UA = { "user-agent": "TastePassport/1.0 (card image resolver)" };
const OUT = new URL("../data/card-images.json", import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

async function getJson(url) {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429) {
      await sleep(5000 * (i + 1));
      continue;
    }
    const t = await res.text();
    try {
      return JSON.parse(t);
    } catch {
      await sleep(3000);
    }
  }
  return {};
}

async function lead(title) {
  const p = new URLSearchParams({ action: "query", prop: "pageimages", piprop: "thumbnail", pithumbsize: "480", redirects: "1", titles: title, format: "json" });
  const j = await getJson(`https://en.wikipedia.org/w/api.php?${p}`);
  const src = Object.values(j.query?.pages ?? {})[0]?.thumbnail?.source;
  return src && !/\.svg/i.test(src) ? src : null;
}

async function search(title) {
  const p = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: title, gsrlimit: "4", prop: "pageimages", piprop: "thumbnail", pithumbsize: "480", format: "json",
  });
  const j = await getJson(`https://en.wikipedia.org/w/api.php?${p}`);
  const pages = Object.values(j.query?.pages ?? {})
    .filter((x) => x.thumbnail?.source && !/\.svg/i.test(x.thumbnail.source))
    .sort((a, b) => (a.index ?? 9) - (b.index ?? 9));
  return pages[0]?.thumbnail.source ?? null;
}

for (const c of SEED_CARDS) {
  if (out[c.id]) continue;
  const t = c.wikiTitle ?? c.title;
  let src = await lead(t);
  if (!src) src = await search(t);
  if (!src && /\s[—–-]\s/.test(t)) src = await lead(t.split(/\s[—–-]\s/)[0]);
  if (src) out[c.id] = src;
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  await sleep(500);
}
console.log(`resolved ${Object.keys(out).length}/${SEED_CARDS.length}`);
console.log("missing:", SEED_CARDS.filter((c) => !out[c.id]).map((c) => c.id).join(", "));
