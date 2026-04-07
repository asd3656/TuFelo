import Link from "next/link"
import { AdminPageClient } from "@/components/admin-page-client"
import { fetchMembers } from "@/lib/data/members"
import { getSessionFromCookies } from "@/lib/auth/admin"
import { Button } from "@/components/ui/button"

export default async function AdminPage() {
  const session = await getSessionFromCookies()
  const isAdmin = session !== null && session.role !== "guest"
  const isGuest = session?.role === "guest"

  if (!isAdmin && !isGuest) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-foreground text-lg font-medium">운영진만 접근할 수 있습니다.</p>
          <Button asChild variant="outline">
            <Link href="/">홈으로</Link>
          </Button>
        </div>
      </main>
    )
  }

  const members = await fetchMembers()
  return <AdminPageClient initialMembers={members} isGuest={isGuest} />
}
