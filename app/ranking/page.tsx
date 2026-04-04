import { RankingPageClient } from "@/components/ranking-page-client"
import { fetchRankingData } from "@/lib/data/matches"

export default async function RankingPage() {
  const { members, matches } = await fetchRankingData()
  return <RankingPageClient members={members} allMatches={matches} />
}
