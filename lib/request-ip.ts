import { headers } from "next/headers"

/** 프록시 뒤에서의 클라이언트 IP (추적용). */
export async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const xff = h.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  return h.get("x-real-ip") ?? null
}
