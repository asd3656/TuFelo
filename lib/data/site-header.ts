import { getSessionFromCookies } from "@/lib/auth/admin"
import { createServiceClient } from "@/lib/supabase/service"

export interface SiteHeaderData {
  isAdmin: boolean
  isCreator: boolean
  isGuest: boolean
  loggedInUsername?: string
  adminUsernames: string[]
}

async function fetchAdminUsernames(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("admins")
    .select("username, role")
    .neq("role", "guest")
    .order("created_at", { ascending: true })

  if (!data) return []
  return data.map((row) => row.username as string)
}

export async function fetchSiteHeaderData(): Promise<SiteHeaderData> {
  const [session, adminUsernames] = await Promise.all([getSessionFromCookies(), fetchAdminUsernames()])

  return {
    isAdmin: session !== null && session.role !== "guest",
    isCreator: session?.role === "creator",
    isGuest: session?.role === "guest",
    loggedInUsername: session?.username,
    adminUsernames,
  }
}
