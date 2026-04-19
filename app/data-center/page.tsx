import { DataCenterPageClient } from "@/components/data-center-page-client"
import { fetchDataCenterInitialData } from "@/lib/data/data-center"

export default async function DataCenterPage() {
  const { members, matches, seasons } = await fetchDataCenterInitialData()

  return <DataCenterPageClient members={members} matches={matches} seasons={seasons} />
}
