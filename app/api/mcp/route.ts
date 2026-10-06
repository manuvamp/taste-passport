import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * Hosted MCP endpoint — the same 5 tools as mcp/server.mjs, exposed over
 * stateless HTTP JSON-RPC so judges can point a remote-capable MCP client at
 * the public deployment (no localhost stdio needed).
 *
 * The session is supplied per-request via ?sid=<sessionId> (the anonymous
 * cookie id shown on /dev). Nothing secret crosses this boundary: every tool
 * is served from the public web API, same as the stdio server.
 *
 * Discovery:
 *   GET  /api/mcp            -> server info + tool list + how to connect
 *   POST /api/mcp?sid=…      -> JSON-RPC: initialize | tools/list | tools/call | ping
 */

const PROTOCOL_VERSION = "2024-11-05";

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
      },
      required: ["context"],
      additionalProperties: false,
    },
  },
  {
    name: "explain_taste_match",
    description: "Explain why a given entity matches (or doesn't match) the user's taste, with taste-graph bridges.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string", description: "Entity title, e.g. 'Noma'" } },
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

function baseUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

async function api(req: Request, path: string, init?: RequestInit) {
  const url = new URL(path, baseUrl(req));
  const sid = new URL(req.url).searchParams.get("sid");
  if (sid) url.searchParams.set("sid", sid);
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

type Profile = {
  profileVersion: number;
  confidence: number;
  archetype: { name: string; description: string };
  tasteSummary: string;
  coreEntities: { title: string; domain: string }[];
  negativeSignals: { title: string }[];
  domainPreferences: Record<string, number>;
  unexpectedConnections: { title: string }[];
};

async function callTool(req: Request, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "get_taste_profile":
      return JSON.stringify(await api(req, "/api/taste/profile"), null, 2);

    case "get_taste_context": {
      const p = (await api(req, "/api/taste/profile")) as unknown as Profile;
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
      const plan = (await api(req, "/api/agent/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: args.context, withTaste: true }),
      })) as { intro: string; items: { name: string; domain: string; matchPct?: number; whyThis: string }[] };
      return JSON.stringify(
        {
          intro: plan.intro,
          picks: plan.items.map((i) => ({ name: i.name, domain: i.domain, match: i.matchPct, why: i.whyThis })),
        },
        null,
        2
      );
    }

    case "explain_taste_match":
      return JSON.stringify(await api(req, `/api/taste/explain?title=${encodeURIComponent(String(args.title ?? ""))}`), null, 2);

    case "record_feedback": {
      const cards = (await api(req, "/api/cards")) as { cards: { id: string; title: string }[] };
      const card = cards.cards.find((c) => c.title.toLowerCase() === String(args.title ?? "").toLowerCase());
      if (!card) throw new Error(`unknown entity '${args.title}' — must be a Taste Passport seed entity`);
      const out = (await api(req, "/api/taste/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.id, feedback: args.feedback, itemId: "mcp" }),
      })) as { profileVersion: number; confidence: number };
      return JSON.stringify({ ok: true, profileVersion: out.profileVersion, confidence: out.confidence });
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

export async function GET(req: Request) {
  const sid = new URL(req.url).searchParams.get("sid");
  return NextResponse.json({
    name: "taste-passport",
    version: "1.0.0",
    protocolVersion: PROTOCOL_VERSION,
    transport: "http-jsonrpc",
    endpoint: sid ? `/api/mcp?sid=${sid}` : "/api/mcp?sid=<your-session-id>",
    note: "Stateless HTTP JSON-RPC. POST {jsonrpc,id,method,params}. Supply your anonymous session id as ?sid=… (see /dev). Same tools as mcp/server.mjs.",
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, "mcp"), 30, 1)) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "rate limited" } }, { status: 429 });
  }
  const msg = (await req.json().catch(() => null)) as { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } } | null;
  if (!msg || !msg.method) {
    return NextResponse.json({ jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "invalid request" } }, { status: 400 });
  }
  const { id, method, params } = msg;
  try {
    let result: unknown;
    if (method === "initialize") {
      result = { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: "taste-passport", version: "1.0.0" } };
    } else if (method === "tools/list") {
      result = { tools: TOOLS };
    } else if (method === "tools/call") {
      const text = await callTool(req, params?.name ?? "", params?.arguments ?? {});
      result = { content: [{ type: "text", text }] };
    } else if (method === "ping") {
      result = {};
    } else {
      return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `method not found: ${method}` } }, { status: 404 });
    }
    return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
  } catch (e) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message: e instanceof Error ? e.message : String(e) } },
      { status: 200 } // JSON-RPC errors travel in-band
    );
  }
}
