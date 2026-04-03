import { cookies } from "next/headers"

export const ADMIN_SESSION_COOKIE = "tuFelo_admin"

export async function isAdminFromCookies(): Promise<boolean> {
  const jar = await cookies()
  return jar.get(ADMIN_SESSION_COOKIE)?.value === "1"
}
