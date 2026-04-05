import { DashboardPage } from "@/components/dashboard-page"
import { fetchMatchesForDashboard } from "@/lib/data/matches"
import { fetchActiveMembers } from "@/lib/data/members"
import { getSessionFromCookies } from "@/lib/auth/admin"

export default async function HomePage() {
  const [initialMatches, members, session] = await Promise.all([
    fetchMatchesForDashboard(),
    fetchActiveMembers(),
    getSessionFromCookies(),
  ])

  return (
    <DashboardPage
      initialMatches={initialMatches}
      members={members}
      isAdmin={session !== null}
      isCreator={session?.role === "creator"}
    />
  )
}

export type { Match, Race, Tier } from "@/lib/types/tufelo"
