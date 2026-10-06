import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

const DOMAINS: { name: string; color: string }[] = [
  { name: "music", color: "#f472b6" },
  { name: "film", color: "#f59e0b" },
  { name: "fashion", color: "#a78bfa" },
  { name: "food", color: "#fb923c" },
  { name: "travel", color: "#34d399" },
  { name: "art", color: "#f87171" },
];

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(160deg, #141417 0%, #0b0b0d 70%)",
          color: "#f2efe9",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 8, color: "#a8a49c", textTransform: "uppercase" }}>
          Qloo Agentic Hackathon
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 92, lineHeight: 1.02 }}>
            <span>Teach AI</span>
            <span style={{ fontStyle: "italic" }}>what you love.</span>
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 26, color: "#a8a49c", maxWidth: 900 }}>
            Taste Passport — a portable cultural fingerprint for any AI agent, built on the Qloo taste graph.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {DOMAINS.map((d) => (
              <div
                key={d.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 20,
                  color: d.color,
                  textTransform: "uppercase",
                  letterSpacing: 3,
                }}
              >
                <div style={{ width: 12, height: 12, borderRadius: 999, background: d.color }} />
                {d.name}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 20, color: "#6b6862" }}>taste-passport</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
