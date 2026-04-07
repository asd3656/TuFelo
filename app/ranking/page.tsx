import { RankingPageClient } from "@/components/ranking-page-client"
import { fetchRankingData } from "@/lib/data/matches"

export default async function RankingPage() {
  const { members, matches, seasons, currentSeason, pastSeasonRankings } = await fetchRankingData()
  return (
    <RankingPageClient
      members={members}
      allMatches={matches}
      seasons={seasons}
      currentSeason={currentSeason}
      pastSeasonRankings={pastSeasonRankings}
    />
  )
}
