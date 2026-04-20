import { RankingPageClient } from "@/components/ranking-page-client"
import { fetchRankingData } from "@/lib/data/matches"
import { fetchSiteHeaderData } from "@/lib/data/site-header"

export default async function RankingPage() {
  const [{ members, matches, seasons, currentSeason, pastSeasonRankings }, headerData] = await Promise.all([
    fetchRankingData(),
    fetchSiteHeaderData(),
  ])
  return (
    <RankingPageClient
      members={members}
      allMatches={matches}
      seasons={seasons}
      currentSeason={currentSeason}
      pastSeasonRankings={pastSeasonRankings}
      headerData={headerData}
    />
  )
}
