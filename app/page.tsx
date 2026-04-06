import { DashboardPage } from "@/components/dashboard-page"
import { fetchMatchesForDashboard } from "@/lib/data/matches"
import { fetchActiveMembers } from "@/lib/data/members"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { createServiceClient } from "@/lib/supabase/service"

async function fetchAdminUsernames(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("admins")
    .select("username")
    .order("created_at", { ascending: true })
  if (!data) return []
  return data.map((row) => row.username as string)
}

export default async function HomePage() {
  const [initialMatches, members, session, adminUsernames] = await Promise.all([
    fetchMatchesForDashboard(),
    fetchActiveMembers(),
    getSessionFromCookies(),
    fetchAdminUsernames(),
  ])

  return (
    <DashboardPage
      initialMatches={initialMatches}
      members={members}
      isAdmin={session !== null}
      isCreator={session?.role === "creator"}
      adminUsernames={adminUsernames}
    />
  )
}

export type { Match, Race, Tier } from "@/lib/types/tufelo"
