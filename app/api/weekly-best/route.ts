import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getSeoulDateString } from "@/lib/date-seoul"
import type { Race, Tier } from "@/lib/types/tufelo"

type MemberRow = {
  id: string
  name: string
  race: Race
  tier: Tier
  elo: number
  wins: number
  losses: number
  is_active: boolean
}

type MatchRow = {
  player1_id: string
  player2_id: string
  player1_elo_delta: number | null
  player2_elo_delta: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseYmd(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number)
  return { year, month, day }
}

function formatYmdFromUtcMs(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function getRecentCompletedWeekRange(todaySeoul: string) {
  const { year, month, day } = parseYmd(todaySeoul)
  const todayUtcMs = Date.UTC(year, month - 1, day)
  const todayDow = new Date(todayUtcMs).getUTCDay() // 0: Sun, 1: Mon, ... 6: Sat
  const offsetToLastSunday = todayDow === 0 ? 7 : todayDow
  const endUtcMs = todayUtcMs - offsetToLastSunday * DAY_MS
  const startUtcMs = endUtcMs - 6 * DAY_MS
  return {
    weekStart: formatYmdFromUtcMs(startUtcMs),
    weekEnd: formatYmdFromUtcMs(endUtcMs),
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const todaySeoul = getSeoulDateString()
    const { weekStart, weekEnd } = getRecentCompletedWeekRange(todaySeoul)

    const [membersRes, matchesRes] = await Promise.all([
      supabase
        .from("members")
        .select("id, name, race, tier, elo, wins, losses, is_active")
        .eq("is_active", true),
      supabase
        .from("matches")
        .select("player1_id, player2_id, player1_elo_delta, player2_elo_delta")
        .gte("played_date", weekStart)
        .lte("played_date", weekEnd),
    ])

    if (membersRes.error) {
      return NextResponse.json({ error: membersRes.error.message }, { status: 500 })
    }
    if (matchesRes.error) {
      return NextResponse.json({ error: matchesRes.error.message }, { status: 500 })
    }

    const members = (membersRes.data ?? []) as MemberRow[]
    const matches = (matchesRes.data ?? []) as MatchRow[]

    const membersById = new Map(members.map((m) => [m.id, m]))

    const tierRankMap = new Map<string, number>()
    const byTier = new Map<Tier, MemberRow[]>()
    // 랭킹 페이지와 동일하게 0승 0패 선수는 티어 내 순위에서 제외
    const membersForTierRank = members.filter((m) => m.wins + m.losses > 0)
    for (const member of membersForTierRank) {
      const list = byTier.get(member.tier) ?? []
      list.push(member)
      byTier.set(member.tier, list)
    }
    for (const [, tierMembers] of byTier) {
      tierMembers
        .sort((a, b) => b.elo - a.elo)
        .forEach((member, index) => {
          tierRankMap.set(member.id, index + 1)
        })
    }

    const weeklyDeltaMap = new Map<string, number>()
    const applyDelta = (memberId: string, delta: number | null) => {
      if (delta === null || delta === undefined) return
      if (!membersById.has(memberId)) return
      weeklyDeltaMap.set(memberId, (weeklyDeltaMap.get(memberId) ?? 0) + delta)
    }

    for (const match of matches) {
      applyDelta(match.player1_id, match.player1_elo_delta)
      applyDelta(match.player2_id, match.player2_elo_delta)
    }

    const ranking = Array.from(weeklyDeltaMap.entries())
      .map(([memberId, weeklyDelta]) => {
        const member = membersById.get(memberId)
        if (!member) return null
        return {
          memberId: member.id,
          nickname: member.name,
          race: member.race,
          tier: member.tier,
          elo: member.elo,
          tierEloRank: tierRankMap.get(member.id) ?? 0,
          weeklyDelta,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        if (b.weeklyDelta !== a.weeklyDelta) return b.weeklyDelta - a.weeklyDelta
        return b.elo - a.elo
      })
      .slice(0, 5)

    return NextResponse.json({
      weekStart,
      weekEnd,
      ranking,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
