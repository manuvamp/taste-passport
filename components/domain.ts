export const DOMAIN_COLORS: Record<string, string> = {
  music: "#f472b6",
  film: "#f59e0b",
  tv: "#ef4444",
  fashion: "#a78bfa",
  food: "#fb923c",
  travel: "#34d399",
  architecture: "#60a5fa",
  book: "#facc15",
  game: "#22d3ee",
  brand: "#e879f9",
  art: "#f87171",
  lifestyle: "#a3e635",
};

export function domainColor(domain: string): string {
  return DOMAIN_COLORS[domain] ?? "#e8e4dc";
}
