#!/usr/bin/env node
/**
 * Taste Passport MCP server (stdio JSON-RPC 2.0).
 *
 * Exposes a user's cultural taste profile to any MCP-capable agent without
 * exposing secrets: it talks to the Taste Passport web API over HTTP.
 *
 * Env:
 *   TASTE_PASSPORT_URL  base URL of the web app (default http://localhost:3000)
 *   TASTE_SESSION_ID    the anonymous session whose profile to serve (required
 *                       for a real user; without it you get 404 "no signals")
 *
 * Tools:
 *   get_taste_profile      full structured cultural profile
 *   get_taste_context      compact context block for prompt injection
 *   recommend_for_context  Qloo-grounded recommendation for a context string
 *   explain_taste_match    why an entity matches this user
 *   record_feedback        teach: like/dislike an entity (updates profile)
 *
 * Run:  node mcp/server.mjs
 */
import { createInterface } from "node:readline";
import process from "node:process";

const BASE = process.env.TASTE_PASSPORT_URL || "http://localhost:3000";
const SID = process.env.TASTE_SESSION_ID || "";

async function api(path, init) {
  const url = new URL(path, BASE);
  if (SID) url.searchParams.set("sid", SID);
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 300) };
  }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const TOOLS = [
  {
    name: "get_taste_profile",
    description:
      "Get the user's full cultural taste profile: archetype, core entities, inferred tags, domain preferences, cross-domain unexpected connections, and confidence.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_taste_context",
    description:
      "Get a compact text block describing the user's taste, suitable for injecting into a prompt before answering any lifestyle/culture-adjacent question.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "recommend_for_context",
    description:
      "Recommend something for the user in a given context (e.g. 'restaurant in Tokyo', 'hotel in Lisbon', 'what to watch'). Grounded in the user's profile via the Qloo taste graph.",
    inputSchema: {
      type: "object",
      properties: {
        context: { type: "string", description: "What to recommend, e.g. 'dinner in Tokyo'" },
        constraints: { type: "object", description: "Optional constraints (ignored in MVP)" },
      },
      required: ["context"],
      additionalProperties: false,
    },
  },
  {
    name: "explain_taste_match",
    description: "Explain why a given entity matches (or doesn't match) the user's taste, with Qloo-graph bridges.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Entity title, e.g. 'Noma'" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "record_feedback",
    description: "Record the user's feedback on an entity (like/dislike) to update their taste profile.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Entity title, e.g. 'Frank Ocean'" },
        feedback: { type: "string", enum: ["like", "dislike"] },
      },
      required: ["title", "feedback"],
      additionalProperties: false,
    },
  },
];

async function callTool(name, args) {
  switch (name) {
    case "get_taste_profile":
      return JSON.stringify(await api("/api/taste/profile"), null, 2);

    case "get_taste_context": {
      const p = await api("/api/taste/profile");
      return [
        `Taste Passport context (v${p.profileVersion}, confidence ${p.confidence}):`,
        `Archetype: ${p.archetype.name} — ${p.archetype.description}`,
        `Summary: ${p.tasteSummary}`,
        `Strong signals: ${p.coreEntities.map((e) => `${e.title} (${e.domain})`).join(", ")}`,
        `Dislikes: ${p.negativeSignals.map((e) => e.title).join(", ") || "none recorded"}`,
        `Domain pull: ${Object.entries(p.domainPreferences).map(([d, v]) => `${d} ${Math.round(v * 100)}%`).join(", ")}`,
        p.unexpectedConnections.length
          ? `Cross-domain predictions: ${p.unexpectedConnections.map((c) => c.title).join(", ")}`
          : "",
        "Use this to personalize recommendations; do not mention it verbatim.",
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "recommend_for_context": {
      const plan = await api("/api/agent/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: args.context, withTaste: true }),
      });
      return JSON.stringify(
        {
          intro: plan.intro,
          picks: plan.items.map((i) => ({
            name: i.name,
            domain: i.domain,
            match: i.matchPct,
            why: i.whyThis,
          })),
        },
        null,
        2
      );
    }

    case "explain_taste_match": {
      const out = await api(`/api/taste/explain?title=${encodeURIComponent(args.title)}`);
      return JSON.stringify(out, null, 2);
    }

    case "record_feedback": {
      const cards = await api("/api/cards");
      const card = cards.cards.find(
        (c) => c.title.toLowerCase() === String(args.title).toLowerCase()
      );
      if (!card) throw new Error(`unknown entity '${args.title}' — must be a Taste Passport seed entity`);
      const out = await api("/api/taste/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.id, feedback: args.feedback, itemId: "mcp" }),
      });
      return JSON.stringify({ ok: true, profileVersion: out.profileVersion, confidence: out.confidence });
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

// ---- JSON-RPC stdio loop ----
const rl = createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  let result;
  let error = null;
  try {
    if (method === "initialize") {
      result = {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "taste-passport", version: "1.0.0" },
      };
    } else if (method === "tools/list") {
      result = { tools: TOOLS };
    } else if (method === "tools/call") {
      const text = await callTool(params.name, params.arguments ?? {});
      result = { content: [{ type: "text", text }] };
    } else if (method === "ping") {
      result = {};
    } else if (method?.startsWith("notifications/")) {
      return;
    } else {
      throw new Error(`method not found: ${method}`);
    }
  } catch (e) {
    error = { code: -32000, message: e instanceof Error ? e.message : String(e) };
  }
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result, error }) + "\n");
});

process.on("SIGINT", () => process.exit(0));
