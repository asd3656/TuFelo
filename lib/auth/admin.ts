import { cookies } from "next/headers"

export const ADMIN_SESSION_COOKIE = "tuFelo_admin"

export type AdminRole = "admin" | "creator" | "guest"

export interface AdminSession {
  username: string
  role: AdminRole
}

export async function getSessionFromCookies(): Promise<AdminSession | null> {
  const jar = await cookies()
  const val = jar.get(ADMIN_SESSION_COOKIE)?.value
  if (!val) return null
  const parts = val.split("|")
  if (parts.length !== 2) return null
  const [username, role] = parts
  if (!username || (role !== "admin" && role !== "creator" && role !== "guest")) return null
  return { username, role: role as AdminRole }
}

export async function isAdminFromCookies(): Promise<boolean> {
  const session = await getSessionFromCookies()
  return session !== null && session.role !== "guest"
}

export async function isCreatorFromCookies(): Promise<boolean> {
  const session = await getSessionFromCookies()
  return session?.role === "creator"
}

export async function isGuestFromCookies(): Promise<boolean> {
  const session = await getSessionFromCookies()
  return session?.role === "guest"
}
