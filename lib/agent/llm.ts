/**
 * Optional LLM layer. The LLM only turns structured, Qloo-derived signals into
 * prose — it never invents recommendations. Without OPENAI_API_KEY everything
 * still works via deterministic templates (clearly the same structured data).
 */

export function llmEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function llmWrite(system: string, user: string, maxTokens = 350): Promise<string | null> {
  if (!llmEnabled()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
