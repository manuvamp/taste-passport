import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/qloo/cache";

/**
 * GET /api/img?title=Wikipedia_Title&w=640
 *
 * Resolves a legally-usable Wikipedia thumbnail (CC / public domain) for a
 * card's entity and streams the bytes same-origin. Resolution strategy:
 *   1. the article's own lead image (prop=pageimages)
 *   2. if the article has no lead image (common for brands/people/concepts),
 *      the top Wikipedia search hit that does have one
 * Failures are cached briefly; successes for a day.
 */
const WIKI_API = "https://en.wikipedia.org/w/api.php";

async function resolveThumb(title: string, width: number): Promise<string | null> {
  const base = {
    action: "query",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: String(width),
    format: "json",
    origin: "*",
  };

  // 1) exact article
  const exact = new URLSearchParams({ ...base, titles: title });
  try {
    const res = await fetch(`${WIKI_API}?${exact}`, {
      headers: { "user-agent": "TastePassport/1.0 (hackathon demo)" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
      };
      const pages = Object.values(json.query?.pages ?? {});
      const thumb = pages[0]?.thumbnail?.source;
      if (thumb) return thumb;
    }
  } catch {
    // fall through to search
  }

  // 2) closest article with a lead image
  const search = new URLSearchParams({
    ...base,
    generator: "search",
    gsrsearch: title,
    gsrlimit: "3",
  });
  try {
    const res = await fetch(`${WIKI_API}?${search}`, {
      headers: { "user-agent": "TastePassport/1.0 (hackathon demo)" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        query?: { pages?: Record<string, { thumbnail?: { source?: string }; index?: number }> };
      };
      const pages = Object.values(json.query?.pages ?? {})
        .filter((p) => p.thumbnail?.source)
        .sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
      if (pages[0]?.thumbnail?.source) return pages[0].thumbnail.source;
    }
  } catch {
    // fall through to commons
  }

  // 3) Wikimedia Commons file search (covers brands/concepts without article images)
  const commons = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: title,
    gsrnamespace: "6",
    gsrlimit: "5",
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: String(width),
    format: "json",
    origin: "*",
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${commons}`, {
    headers: { "user-agent": "TastePassport/1.0 (hackathon demo)" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    query?: {
      pages?: Record<string, { index?: number; imageinfo?: { mime?: string; thumburl?: string; url?: string }[] }>;
    };
  };
  const files = Object.values(json.query?.pages ?? {})
    .filter((p) => p.imageinfo?.[0])
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  for (const f of files) {
    const info = f.imageinfo![0];
    // bitmaps only — svg/djvu/pdf thumbs render poorly as cover art
    if (info.mime?.startsWith("image/") && info.mime !== "image/svg+xml") {
      return info.thumburl ?? info.url ?? null;
    }
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = url.searchParams.get("title")?.trim();
  const width = Math.min(Number(url.searchParams.get("w") ?? 640), 1024);
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const key = `img:${title}:${width}`;
  let src: string | null | undefined = cacheGet<string>(key);
  if (!src) {
    try {
      src = await resolveThumb(title, width);
      // decorated titles like "Church of the Light — Tadao Ando" defeat search;
      // retry with the part before the dash
      if (!src) {
        const cleaned = title.split(/\s[—–-]\s/)[0].trim();
        if (cleaned && cleaned !== title) src = await resolveThumb(cleaned, width);
      }
      if (!src) throw new Error("no image");
      cacheSet(key, src, 1000 * 60 * 60 * 24);
    } catch {
      // short negative cache so cards can recover, but we don't hammer the API
      cacheSet(key, "", 1000 * 60 * 10);
      return NextResponse.json({ error: "image unavailable" }, { status: 404 });
    }
  }
  if (src === "") return NextResponse.json({ error: "image unavailable" }, { status: 404 });

  // redirect to the CDN thumb: no proxying bytes through our server, and the
  // browser caches the redirect so repeat views are instant
  return new Response(null, {
    status: 302,
    headers: { location: src, "cache-control": "public, max-age=86400, s-maxage=86400" },
  });
}
