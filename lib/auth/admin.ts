import { cookies } from "next/headers"

export const ADMIN_SESSION_COOKIE = "tuFelo_admin"

export interface AdminSession {
  username: string
  role: "admin" | "creator"
}

export async function getSessionFromCookies(): Promise<AdminSession | null> {
  const jar = await cookies()
  const val = jar.get(ADMIN_SESSION_COOKIE)?.value
  if (!val) return null
  const parts = val.split("|")
  if (parts.length !== 2) return null
  const [username, role] = parts
  if (!username || (role !== "admin" && role !== "creator")) return null
  return { username, role: role as "admin" | "creator" }
}

export async function isAdminFromCookies(): Promise<boolean> {
  const session = await getSessionFromCookies()
  return session !== null
}

export async function isCreatorFromCookies(): Promise<boolean> {
  const session = await getSessionFromCookies()
  return session?.role === "creator"
}
