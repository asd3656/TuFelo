import { RankingPublicClient } from "@/components/ranking-public-client"
import { fetchRankingData } from "@/lib/data/matches"

export default async function RankingPublicPage() {
  const { members, matches, seasons, currentSeason, pastSeasonRankings } = await fetchRankingData()
  return (
    <RankingPublicClient
      members={members}
      allMatches={matches}
      seasons={seasons}
      currentSeason={currentSeason}
      pastSeasonRankings={pastSeasonRankings}
    />
  )
}
