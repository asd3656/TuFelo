import { DashboardPage } from "@/components/dashboard-page"
import { fetchMatchesForDashboard } from "@/lib/data/matches"
import { fetchMembers } from "@/lib/data/members"
import { isAdminFromCookies } from "@/lib/auth/admin"

export default async function HomePage() {
  const [initialMatches, members, isAdmin] = await Promise.all([
    fetchMatchesForDashboard(),
    fetchMembers(),
    isAdminFromCookies(),
  ])

  return <DashboardPage initialMatches={initialMatches} members={members} isAdmin={isAdmin} />
}

export type { Match, Race, Tier } from "@/lib/types/tufelo"
