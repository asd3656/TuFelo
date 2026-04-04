import { RankingPublicClient } from "@/components/ranking-public-client"
import { fetchRankingData } from "@/lib/data/matches"

export default async function RankingPublicPage() {
  const { members, matches } = await fetchRankingData()
  return <RankingPublicClient members={members} allMatches={matches} />
}
