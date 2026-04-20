import { DashboardPage } from "@/components/dashboard-page"
import { fetchInitialDashboardData } from "@/lib/data/matches"
import { fetchActiveMembers } from "@/lib/data/members"
import { fetchSeasons } from "@/lib/data/seasons"
import { fetchSiteHeaderData } from "@/lib/data/site-header"

export default async function HomePage() {
  const [dashboardData, members, headerData, seasons] = await Promise.all([
    fetchInitialDashboardData(),
    fetchActiveMembers(),
    fetchSiteHeaderData(),
    fetchSeasons(),
  ])

  const currentSeason = seasons.find((s) => s.endDate === null) ?? null

  return (
    <DashboardPage
      initialMatches={dashboardData.matches}
      initialTotalCount={dashboardData.totalCount}
      initialTotalPages={dashboardData.totalPages}
      knownMaps={dashboardData.knownMaps}
      knownMatchTypes={dashboardData.knownMatchTypes}
      members={members}
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
