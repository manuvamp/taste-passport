import { cookies } from "next/headers";
import { getOrCreateSession, type SessionRecord } from "@/lib/store/db";

export const SESSION_COOKIE = "tp_sid";

/** Resolve (or lazily create) the anonymous session for this request. */
export async function resolveSession(explicitId?: string): Promise<SessionRecord> {
  const jar = await cookies();
  const id = explicitId || jar.get(SESSION_COOKIE)?.value || undefined;
  return getOrCreateSession(id);
}
