import { DashboardPage } from "@/components/dashboard-page"
import { fetchInitialDashboardData } from "@/lib/data/matches"
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
  const [dashboardData, members, session, adminUsernames] = await Promise.all([
    fetchInitialDashboardData(),
    fetchActiveMembers(),
    getSessionFromCookies(),
    fetchAdminUsernames(),
  ])

  return (
    <DashboardPage
      initialMatches={dashboardData.matches}
      initialTotalCount={dashboardData.totalCount}
      initialTotalPages={dashboardData.totalPages}
      knownMaps={dashboardData.knownMaps}
      knownMatchTypes={dashboardData.knownMatchTypes}
      members={members}
      isAdmin={session !== null}
      isCreator={session?.role === "creator"}
      adminUsernames={adminUsernames}
    />
  )
}

export type { Match, Race, Tier } from "@/lib/types/tufelo"
