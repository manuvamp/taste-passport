// Resolves one small photo per vibe tile (Wikipedia lead images, batched 50/request)
// and writes data/vibe-images.json. Run: node --experimental-strip-types scripts/resolve-vibe-images.mjs
import { writeFileSync } from "node:fs";
import { VIBES } from "../data/vibes.ts";

const API = "https://en.wikipedia.org/w/api.php";
const UA = { "user-agent": "TastePassport/1.0 (vibe image resolver)" };
const queries = [...new Set(VIBES.map((v) => v.imageQuery).filter(Boolean))];
const byQuery = {};

for (let i = 0; i < queries.length; i += 50) {
  const chunk = queries.slice(i, i + 50);
  const p = new URLSearchParams({
    action: "query", prop: "pageimages", piprop: "thumbnail", pithumbsize: "360",
    redirects: "1", titles: chunk.join("|"), format: "json",
  });
  const json = await (await fetch(`${API}?${p}`, { headers: UA })).json();
  const alias = {};
  for (const k of ["normalized", "redirects"]) for (const r of json.query[k] ?? []) alias[r.from] = r.to;
  const resolve = (t) => { let c = t; for (let n = 0; n < 3 && alias[c]; n++) c = alias[c]; return c; };
  const pages = Object.values(json.query.pages);
  for (const q of chunk) {
    const title = resolve(q);
    const pg = pages.find((x) => x.title === title);
    // skip svg renders / flags / maps — they look like diagrams, not vibes
    const src = pg?.thumbnail?.source;
    if (src && !/\.svg/i.test(src)) byQuery[q] = src;
  }
}

const out = {};
for (const v of VIBES) if (v.imageQuery && byQuery[v.imageQuery]) out[v.id] = byQuery[v.imageQuery];
writeFileSync(new URL("../data/vibe-images.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`resolved ${Object.keys(out).length}/${VIBES.length}`);
console.log("missing:", VIBES.filter((v) => !out[v.id]).map((v) => v.id).join(", "));
