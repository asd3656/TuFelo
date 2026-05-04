import { redirect } from "next/navigation"
import Link from "next/link"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { createServiceClient } from "@/lib/supabase/service"
import { CreatorPageClient } from "@/components/creator-page-client"
import { Button } from "@/components/ui/button"
import { fetchSiteHeaderData } from "@/lib/data/site-header"
import { fetchDecorativeBadgesForCreator } from "@/lib/data/decorative-badges"
import type { Season } from "@/lib/types/tufelo"

export default async function CreatorPage() {
  const session = await getSessionFromCookies()
  const isGuest = session?.role === "guest"

  if (!session || (session.role !== "creator" && session.role !== "guest")) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-foreground text-lg font-medium">제작자만 접근할 수 있습니다.</p>
          <Button asChild variant="outline">
            <Link href="/">홈으로</Link>
          </Button>
        </div>
      </main>
    )
  }

  const supabase = createServiceClient()

  const [
    { data: admins },
    { data: logs },
    { data: seasonsRaw },
    headerData,
    decorativeBadges,
    { data: membersForBadges },
  ] = await Promise.all([
    supabase
      .from("admins")
      .select("username, role, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("admin_logs")
      .select("id, admin_username, action, target, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("seasons")
      .select("id, name, start_date, end_date, created_at")
      .order("start_date", { ascending: false }),
    fetchSiteHeaderData(),
    fetchDecorativeBadgesForCreator(),
    supabase.from("members").select("id, name, is_active").order("name"),
  ])

  const seasons: Season[] = (seasonsRaw ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    startDate: r.start_date as string,
    endDate: (r.end_date as string | null) ?? null,
    createdAt: r.created_at as string,
  }))

  const badgeMembers =
    membersForBadges?.filter((m) => m.is_active).map((m) => ({ id: m.id as string, name: m.name as string })) ?? []

  return (
    <CreatorPageClient
      currentUsername={session.username}
      admins={admins ?? []}
      logs={logs ?? []}
      seasons={seasons}
      decorativeBadges={decorativeBadges}
      badgeMembers={badgeMembers}
      isGuest={isGuest}
      headerData={headerData}
    />
  )
}
