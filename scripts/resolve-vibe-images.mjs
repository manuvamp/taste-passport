// Resolves several distinct photos per vibe theme (Wikipedia lead image + Wikimedia Commons
// search) and writes data/vibe-images.json as { themeId: [url, ...] }.
// Polite: sequential with backoff on 429.
// Run: node --experimental-strip-types scripts/resolve-vibe-images.mjs
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { VIBES } from "../data/vibes.ts";

const UA = { "user-agent": "TastePassport/1.0 (vibe image resolver)" };
const PER_THEME = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// filenames that suggest people/faces or non-photos
const BAD = /portrait|people|man\b|men\b|woman|women|girl|boy|crowd|selfie|face|family|wedding|child|kid|team|player|band|concert|logo|map|flag|diagram|icon|poster|screenshot|\.svg|\.png|\.gif|\.tif/i;

async function getJson(url) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429) {
      await sleep(4000 * (i + 1));
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

async function commons(q) {
  const p = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: `${q} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "50",
    prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "360", format: "json",
  });
  const json = await getJson(`https://commons.wikimedia.org/w/api.php?${p}`);
  return Object.values(json.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .map((pg) => ({ title: pg.title, info: pg.imageinfo?.[0] }))
    .filter(({ title, info }) => info?.thumburl && info.mime === "image/jpeg" && info.width >= 700 && !BAD.test(title))
    .map(({ info }) => info.thumburl);
}

async function wikiLead(q) {
  const p = new URLSearchParams({ action: "query", prop: "pageimages", piprop: "thumbnail", pithumbsize: "360", redirects: "1", titles: q, format: "json" });
  const json = await getJson(`https://en.wikipedia.org/w/api.php?${p}`);
  const src = Object.values(json.query?.pages ?? {})[0]?.thumbnail?.source;
  return src && !/\.svg/i.test(src) ? [src] : [];
}

const OUTF = new URL("../data/vibe-images.json", import.meta.url);
const out = existsSync(OUTF) ? JSON.parse(readFileSync(OUTF, "utf8")) : {};
const themes = VIBES.filter((v) => v.imageQuery);
for (const v of themes) {
  if ((out[v.id]?.length ?? 0) >= PER_THEME) continue;
  const lead = await wikiLead(v.imageQuery);
  const found = await commons(v.imageQuery);
  const urls = [...new Set([...(out[v.id] ?? []), ...lead, ...found])].slice(0, PER_THEME);
  if (urls.length >= 3) out[v.id] = urls;
  writeFileSync(OUTF, JSON.stringify(out, null, 1));
  await sleep(700);
}
writeFileSync(new URL("../data/vibe-images.json", import.meta.url), JSON.stringify(out, null, 1));
const total = Object.values(out).reduce((a, u) => a + u.length, 0);
console.log(`themes ${Object.keys(out).length}/${themes.length}, photos ${total}`);
console.log("dropped:", themes.filter((v) => !out[v.id]).map((v) => v.id).join(", "));
