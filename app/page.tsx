import { DashboardPage } from "@/components/dashboard-page"
import { fetchInitialDashboardData } from "@/lib/data/matches"
import { fetchMembers } from "@/lib/data/members"
import { fetchSeasons } from "@/lib/data/seasons"
import { fetchSiteHeaderData } from "@/lib/data/site-header"

export default async function HomePage() {
  const [members, headerData, seasons] = await Promise.all([
    fetchMembers(),
    fetchSiteHeaderData(),
    fetchSeasons(),
  ])
  const activeMembers = members.filter((m) => m.isActive)
  const dashboardData = await fetchInitialDashboardData(members)

  const currentSeason = seasons.find((s) => s.endDate === null) ?? null

  return (
    <DashboardPage
      initialMatches={dashboardData.matches}
      initialTotalCount={dashboardData.totalCount}
      initialTotalPages={dashboardData.totalPages}
      knownMaps={dashboardData.knownMaps}
      knownMatchTypes={dashboardData.knownMatchTypes}
      members={activeMembers}
      isAdmin={headerData.isAdmin}
      isCreator={headerData.isCreator}
      isGuest={headerData.isGuest}
      loggedInUsername={headerData.loggedInUsername}
      adminUsernames={headerData.adminUsernames}
      seasons={seasons}
      currentSeason={currentSeason}
    />
  )
}

export type { Match, Race, Tier } from "@/lib/types/tufelo"
