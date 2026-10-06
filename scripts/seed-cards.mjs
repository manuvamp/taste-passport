#!/usr/bin/env node
/**
 * Seed catalog validator/reporter.
 *
 * Seed cards live in data/cards.ts and load at runtime (no DB seeding needed).
 * This script validates the catalog with plain node: unique ids, known
 * domains, tag hygiene, and per-domain coverage for the cold-start experience.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(path.join(root, "data", "cards.ts"), "utf8");

const KNOWN_DOMAINS = new Set([
  "music", "film", "tv", "fashion", "food", "travel",
  "architecture", "book", "game", "brand", "art", "lifestyle",
]);

const entryRe = /\{\s*id:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*domain:\s*"([^"]+)",(?:\s*wikiTitle:\s*"[^"]+",)?\s*tags:\s*\[([^\]]*)\]/g;

const cards = [];
let m;
while ((m = entryRe.exec(src)) !== null) {
  cards.push({
    id: m[1],
    title: m[2],
    domain: m[3],
    tags: [...m[4].matchAll(/"([^"]+)"/g)].map((t) => t[1]),
  });
}

const errors = [];
const seen = new Set();
for (const c of cards) {
  if (seen.has(c.id)) errors.push(`duplicate id: ${c.id}`);
  seen.add(c.id);
  if (!KNOWN_DOMAINS.has(c.domain)) errors.push(`unknown domain: ${c.domain} (${c.id})`);
  if (c.tags.length < 3) errors.push(`too few tags on ${c.id}: ${c.tags.length}`);
  for (const t of c.tags) {
    if (t !== t.toLowerCase().trim()) errors.push(`tag not normalized on ${c.id}: "${t}"`);
    if (t.includes(" Americana")) errors.push(`leading-space tag on ${c.id}: "${t}"`);
  }
}

const byDomain = {};
for (const c of cards) byDomain[c.domain] = (byDomain[c.domain] ?? 0) + 1;

console.log(`cards: ${cards.length}`);
for (const [d, n] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${d.padEnd(13)} ${n}`);
}
const tagCount = new Set(cards.flatMap((c) => c.tags)).size;
console.log(`distinct tags: ${tagCount}`);

if (cards.length < 150) errors.push(`catalog too small: ${cards.length} < 150`);
if (errors.length) {
  console.error("\nERRORS:");
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("\n✓ seed catalog valid");
