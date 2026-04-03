import { RankingPageClient } from "@/components/ranking-page-client"
import { fetchRankingPlayers } from "@/lib/data/matches"

export default async function RankingPage() {
  const players = await fetchRankingPlayers()
  return <RankingPageClient players={players} />
}
