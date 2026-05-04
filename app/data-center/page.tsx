import { DataCenterPageClient } from "@/components/data-center-page-client"
import { fetchDataCenterInitialData } from "@/lib/data/data-center"
import { fetchSiteHeaderData } from "@/lib/data/site-header"

export default async function DataCenterPage() {
  const [{ members, matches, seasons, decorativeByMember }, headerData] = await Promise.all([
    fetchDataCenterInitialData(),
    fetchSiteHeaderData(),
  ])

  return (
    <DataCenterPageClient
      members={members}
      matches={matches}
      seasons={seasons}
      decorativeByMember={decorativeByMember}
      headerData={headerData}
    />
  )
}
