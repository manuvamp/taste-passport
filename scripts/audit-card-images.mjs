// Audits data/card-images.json: drops dead/non-image URLs and Wikipedia-sourced photos for non-travel cards
// (their lead images are often unrelated, e.g. a random person for "Skateboarding"). Keeps Qloo exact matches.
// Run: node scripts/audit-card-images.mjs
import { readFileSync, writeFileSync } from "node:fs";
const IMG = new URL("../data/card-images.json", import.meta.url);
const QRES = new URL("../data/.qloo-resolved.json", import.meta.url);
const SRC = readFileSync(new URL("../data/cards.ts", import.meta.url), "utf8");
const domain = Object.fromEntries([...SRC.matchAll(/\{ id: "([^"]+)", title: "[^"]+", domain: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
const imgs = JSON.parse(readFileSync(IMG, "utf8"));
const qloo = JSON.parse(readFileSync(QRES, "utf8"));
const out = {};
const dropped = [];
const ids = Object.keys(imgs);
let i = 0;
async function worker() {
  while (i < ids.length) {
    const id = ids[i++];
    const url = imgs[id];
    const isQloo = url.includes("images.qloo.com") && qloo[id];
    if (!isQloo && !["travel", "food", "lifestyle"].includes(domain[id])) { dropped.push(`${id} (wikipedia, ${domain[id]})`); continue; }
    try {
      const r = await fetch(url, { method: "GET", headers: { range: "bytes=0-2048" } });
      const ct = r.headers.get("content-type") ?? "";
      if (!r.ok || !ct.startsWith("image/")) { dropped.push(`${id} (${r.status} ${ct})`); continue; }
      out[id] = url;
    } catch (e) { dropped.push(`${id} (error)`); }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
writeFileSync(IMG, JSON.stringify(out, null, 1));
console.log(`kept ${Object.keys(out).length}/${ids.length}`);
console.log("dropped:\n" + dropped.join("\n"));
