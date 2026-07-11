import { createClient } from "@/lib/supabase/server"

const RECENT_ACTIVE_DAYS = 30

export type LauncherStats = {
  totalActiveMembers: number
  launcherMemberCount: number
  launcherMemberPercentage: number
  recentActiveMemberCount: number
  recentActiveDays: number
  totalRegisteredMatches: number | null
  launcherSourcedMatches: number | null
  launcherMatchPercentage: number | null
}

type LauncherStatsAppsScriptResponse = {
  total_registered?: number
  launcher_sourced?: number
  launcher_percentage?: number
}

export async function getLauncherStats(): Promise<LauncherStats> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("members")
    .select("last_launcher_used_at")
    .eq("is_active", true)

  if (error) throw new Error(error.message)

  const rows = data ?? []
  const totalActiveMembers = rows.length
  const launcherMemberCount = rows.filter((r) => r.last_launcher_used_at !== null).length
  const cutoff = Date.now() - RECENT_ACTIVE_DAYS * 24 * 60 * 60 * 1000
  const recentActiveMemberCount = rows.filter(
    (r) => r.last_launcher_used_at !== null && new Date(r.last_launcher_used_at).getTime() > cutoff,
  ).length

  let totalRegisteredMatches: number | null = null
  let launcherSourcedMatches: number | null = null
  let launcherMatchPercentage: number | null = null

  const scriptUrl = process.env.LAUNCHER_STATS_APPS_SCRIPT_URL
  if (scriptUrl) {
    try {
      const res = await fetch(`${scriptUrl}?action=launcher_stats`, {
        next: { revalidate: 300 },
      })
      if (res.ok) {
        const json = (await res.json()) as LauncherStatsAppsScriptResponse
        totalRegisteredMatches = json.total_registered ?? null
        launcherSourcedMatches = json.launcher_sourced ?? null
        launcherMatchPercentage = json.launcher_percentage ?? null
      }
    } catch {
      // Apps Script 장애 시에도 멤버 통계는 정상 반환
    }
  }

  return {
    totalActiveMembers,
    launcherMemberCount,
    launcherMemberPercentage:
      totalActiveMembers > 0 ? Number(((launcherMemberCount / totalActiveMembers) * 100).toFixed(1)) : 0,
    recentActiveMemberCount,
    recentActiveDays: RECENT_ACTIVE_DAYS,
    totalRegisteredMatches,
    launcherSourcedMatches,
    launcherMatchPercentage,
  }
}
