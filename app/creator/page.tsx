import { redirect } from "next/navigation"
import Link from "next/link"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { createServiceClient } from "@/lib/supabase/service"
import { CreatorPageClient } from "@/components/creator-page-client"
import { Button } from "@/components/ui/button"

export default async function CreatorPage() {
  const session = await getSessionFromCookies()
  if (!session || session.role !== "creator") {
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

  const [{ data: admins }, { data: logs }] = await Promise.all([
    supabase
      .from("admins")
      .select("username, role, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("admin_logs")
      .select("id, admin_username, action, target, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ])

  return (
    <CreatorPageClient
      currentUsername={session.username}
      admins={admins ?? []}
      logs={logs ?? []}
    />
  )
}
